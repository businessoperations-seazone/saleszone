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


# ──────────────────────────────────────────────────────────
# PATCH /api/admin/registrations/<id>
# ──────────────────────────────────────────────────────────

def test_patch_registration_updates_fields(client):
    reg_before = {"id": "r1", "session_id": "s1", "name": "Ana", "is_opportunity": None, "attended_at": "2026-04-20T15:00Z", "fup_sent_at": None, "phone": "+5548999999999"}
    reg_after = {**reg_before, "observacoes": "teste"}
    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN), \
         patch("routes.admin.db.select", return_value=[reg_before]), \
         patch("routes.admin.db.update", return_value=[reg_after]), \
         patch("routes.admin.webinar_fup.handle_patch_update") as mock_hook:
        resp = client.patch(
            "/api/admin/registrations/r1",
            json={"observacoes": "teste"},
            headers=_admin_headers(),
        )
    assert resp.status_code == 200
    assert resp.get_json()["observacoes"] == "teste"
    mock_hook.assert_called_once()
    args, kwargs = mock_hook.call_args
    assert args[0]["is_opportunity"] is None  # previous
    assert args[1]["observacoes"] == "teste"  # updated
    assert args[2] == "s1"  # session_id


def test_patch_registration_calls_hook_with_previous_and_updated(client):
    reg_before = {"id": "r1", "session_id": "s1", "name": "Ana", "is_opportunity": None, "attended_at": "2026-04-20T15:00Z", "fup_sent_at": None, "phone": "+5548999999999"}
    reg_after = {**reg_before, "is_opportunity": True, "opportunity_marked_at": "2026-04-20T15:30Z"}
    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN), \
         patch("routes.admin.db.select", return_value=[reg_before]), \
         patch("routes.admin.db.update", return_value=[reg_after]), \
         patch("routes.admin.webinar_fup.handle_patch_update") as mock_hook:
        resp = client.patch(
            "/api/admin/registrations/r1",
            json={"is_opportunity": True},
            headers=_admin_headers(),
        )
    assert resp.status_code == 200
    mock_hook.assert_called_once()
    prev_arg, new_arg, session_arg = mock_hook.call_args[0]
    assert prev_arg["is_opportunity"] is None
    assert new_arg["is_opportunity"] is True
    assert session_arg == "s1"


def test_patch_registration_not_found(client):
    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN), \
         patch("routes.admin.db.select", return_value=[]):
        resp = client.patch(
            "/api/admin/registrations/ghost",
            json={"observacoes": "x"},
            headers=_admin_headers(),
        )
    assert resp.status_code == 404


def test_patch_registration_empty_body(client):
    reg = {"id": "r1", "session_id": "s1"}
    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN), \
         patch("routes.admin.db.select", return_value=[reg]):
        resp = client.patch(
            "/api/admin/registrations/r1",
            json={},
            headers=_admin_headers(),
        )
    assert resp.status_code == 400


def test_patch_registration_hook_exception_does_not_break_response(client):
    """Exceção no hook não retorna 500 — resposta 200 com o registration atualizado."""
    reg_before = {"id": "r1", "session_id": "s1", "is_opportunity": None}
    reg_after = {**reg_before, "is_opportunity": True}
    with patch("routes.admin.require_admin", return_value=MOCK_ADMIN), \
         patch("routes.admin.db.select", return_value=[reg_before]), \
         patch("routes.admin.db.update", return_value=[reg_after]), \
         patch("routes.admin.webinar_fup.handle_patch_update", side_effect=RuntimeError("boom")):
        resp = client.patch(
            "/api/admin/registrations/r1",
            json={"is_opportunity": True},
            headers=_admin_headers(),
        )
    assert resp.status_code == 200
