from unittest.mock import patch

MOCK_ADMIN = {"email": "admin@seazone.com.br"}


def _admin_headers():
    return {"Authorization": "Bearer test-token"}


# ──────────────────────────────────────────────────────────
# GET /api/admin/dashboard
# ──────────────────────────────────────────────────────────

def test_dashboard(client):
    sessions = [
        {"id": "s1", "status": "live", "date": "2026-04-09"},
        {"id": "s2", "status": "scheduled", "date": "2026-04-09"},
    ]
    regs = [
        {"id": "r1", "session_id": "s1", "attended_at": "2026-04-09T10:00:00Z", "converted": True},
        {"id": "r2", "session_id": "s1", "attended_at": None, "converted": False},
    ]
    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN), \
         patch("routes.admin.db.select") as mock_select:
        mock_select.side_effect = [sessions, regs]
        resp = client.get("/api/admin/dashboard", headers=_admin_headers())

    assert resp.status_code == 200
    body = resp.get_json()
    assert "sessions" in body
    assert "live_now" in body
    assert "registered" in body
    assert "conversion_rate" in body


def test_dashboard_no_auth(client, mock_supabase):
    resp = client.get("/api/admin/dashboard")
    assert resp.status_code == 401


# ──────────────────────────────────────────────────────────
# POST /api/admin/sessions/<id>/cta
# ──────────────────────────────────────────────────────────

def test_toggle_cta(client):
    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN), \
         patch("routes.admin.db.update", return_value=[{"id": "s1", "cta_active": True}]):
        resp = client.post(
            "/api/admin/sessions/s1/cta",
            json={"active": True},
            headers=_admin_headers(),
        )
    assert resp.status_code == 200
    assert resp.get_json()["cta_active"] is True


def test_toggle_cta_missing_active(client):
    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN):
        resp = client.post(
            "/api/admin/sessions/s1/cta",
            json={},
            headers=_admin_headers(),
        )
    assert resp.status_code == 400


# ──────────────────────────────────────────────────────────
# POST /api/admin/sessions/<id>/message
# ──────────────────────────────────────────────────────────

def test_presenter_message(client):
    msg = {"id": "m1", "session_id": "s1", "content": "Bem-vindos!", "sender_type": "presenter"}
    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN), \
         patch("routes.admin.db.insert", return_value=[msg]):
        resp = client.post(
            "/api/admin/sessions/s1/message",
            json={"content": "Bem-vindos!", "presenter_email": "presenter@seazone.com.br"},
            headers=_admin_headers(),
        )
    assert resp.status_code == 201
    assert resp.get_json()["sender_type"] == "presenter"


def test_presenter_message_missing_content(client):
    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN):
        resp = client.post(
            "/api/admin/sessions/s1/message",
            json={},
            headers=_admin_headers(),
        )
    assert resp.status_code == 400


# ──────────────────────────────────────────────────────────
# GET /api/admin/sessions/<id>/registrations
# ──────────────────────────────────────────────────────────

def test_list_registrations_admin(client):
    regs = [{"id": "r1", "session_id": "s1"}, {"id": "r2", "session_id": "s1"}]
    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN), \
         patch("routes.admin.db.select", return_value=regs):
        resp = client.get("/api/admin/sessions/s1/registrations", headers=_admin_headers())
    assert resp.status_code == 200
    assert len(resp.get_json()) == 2


# ──────────────────────────────────────────────────────────
# POST /api/admin/registrations/cta
# ──────────────────────────────────────────────────────────

def test_submit_cta(client):
    reg = {"id": "r1", "session_id": "s1", "access_token": "tok", "cancelled_at": None, "pipedrive_deal_id": None}
    updated = {**reg, "converted": True, "converted_at": "2026-04-09T10:00:00Z"}
    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN), \
         patch("routes.admin.db.select", return_value=[reg]), \
         patch("routes.admin.db.update", return_value=[updated]):
        resp = client.post(
            "/api/admin/registrations/cta",
            json={"session_id": "s1", "token": "tok", "form_data": {"interesse": "sim"}},
            headers=_admin_headers(),
        )
    assert resp.status_code == 200
    assert resp.get_json()["converted"] is True


def test_submit_cta_invalid_token(client):
    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN), \
         patch("routes.admin.db.select", return_value=[]):
        resp = client.post(
            "/api/admin/registrations/cta",
            json={"session_id": "s1", "token": "bad", "form_data": {}},
            headers=_admin_headers(),
        )
    assert resp.status_code == 401


# ──────────────────────────────────────────────────────────
# GET /api/admin/registrations/export
# ──────────────────────────────────────────────────────────

def test_export_csv(client):
    regs = [
        {"id": "r1", "session_id": "s1", "name": "João", "email": "j@j.com",
         "phone": "48999", "created_at": "2026-04-09", "attended_at": "2026-04-09T10:00Z", "converted": True},
    ]
    sessions = [{"id": "s1", "date": "2026-04-09", "starts_at": "14:30:00"}]

    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN), \
         patch("routes.admin.db.select") as mock_select:
        mock_select.side_effect = [regs, sessions]
        resp = client.get("/api/admin/registrations/export", headers=_admin_headers())

    assert resp.status_code == 200
    assert "text/csv" in resp.content_type
    csv_text = resp.data.decode()
    assert "Nome" in csv_text
    assert "João" in csv_text


def test_export_csv_filtered_by_session(client):
    regs = [
        {"id": "r1", "session_id": "s1", "name": "João", "email": "j@j.com",
         "phone": "48999", "created_at": "2026-04-09", "attended_at": None, "converted": False},
    ]
    sessions = [{"id": "s1", "date": "2026-04-09", "starts_at": "14:30:00"}]

    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN), \
         patch("routes.admin.db.select") as mock_select:
        mock_select.side_effect = [regs, sessions]
        resp = client.get("/api/admin/registrations/export?session_id=s1", headers=_admin_headers())

    assert resp.status_code == 200
    assert "Não" in resp.data.decode()
