import csv
import io
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, make_response
import supabase_client as db
from auth import require_admin

bp = Blueprint("admin", __name__)


@bp.before_request
def auth():
    require_admin()


# ──────────────────────────────────────────────────────────
# Dashboard
# ──────────────────────────────────────────────────────────

@bp.route("/dashboard", methods=["GET"])
def dashboard():
    today = datetime.now(timezone.utc).date().isoformat()

    sessions_today = db.select(
        "webinar_sessions",
        filters={"date": f"eq.{today}"}
    ) or []

    total_sessions = len(sessions_today)
    live_now = sum(1 for s in sessions_today if s.get("status") == "live")

    session_ids = [s["id"] for s in sessions_today]
    registered = 0
    attended = 0
    converted = 0

    if session_ids:
        ids_param = ",".join(session_ids)
        regs = db.select(
            "webinar_registrations",
            filters=[
                ("session_id", f"in.({ids_param})"),
                ("cancelled_at", "is.null"),
            ]
        ) or []
        registered = len(regs)
        attended = sum(1 for r in regs if r.get("attended_at"))
        converted = sum(1 for r in regs if r.get("converted"))

    conversion_rate = round(converted / attended * 100, 1) if attended > 0 else 0

    return jsonify({
        "date": today,
        "sessions": total_sessions,
        "live_now": live_now,
        "registered": registered,
        "attended": attended,
        "converted": converted,
        "conversion_rate": conversion_rate,
    }), 200


# ──────────────────────────────────────────────────────────
# CTA Toggle
# ──────────────────────────────────────────────────────────

@bp.route("/sessions/<session_id>/cta", methods=["POST"])
def toggle_cta(session_id):
    data = request.get_json(silent=True) or {}
    active = data.get("active")
    if active is None:
        return jsonify({"error": "Campo 'active' obrigatório"}), 400

    result = db.update(
        "webinar_sessions",
        filters={"id": f"eq.{session_id}"},
        data={"cta_active": bool(active)}
    )
    updated = result[0] if result else {"id": session_id, "cta_active": bool(active)}
    return jsonify(updated), 200


# ──────────────────────────────────────────────────────────
# Presenter message
# ──────────────────────────────────────────────────────────

@bp.route("/sessions/<session_id>/message", methods=["POST"])
def presenter_message(session_id):
    data = request.get_json(silent=True) or {}
    content = data.get("content")
    presenter_email = data.get("presenter_email")

    if not content:
        return jsonify({"error": "Campo 'content' obrigatório"}), 400

    message = {
        "session_id": session_id,
        "content": content,
        "sender_type": "presenter",
        "sender_name": presenter_email or "Apresentador",
    }

    result = db.insert("webinar_messages", message)
    created = result[0] if result else message
    return jsonify(created), 201


# ──────────────────────────────────────────────────────────
# List registrations for a session
# ──────────────────────────────────────────────────────────

@bp.route("/sessions/<session_id>/registrations", methods=["GET"])
def list_registrations(session_id):
    regs = db.select(
        "webinar_registrations",
        filters={"session_id": f"eq.{session_id}"},
        order="created_at.asc"
    ) or []
    return jsonify(regs), 200


# ──────────────────────────────────────────────────────────
# CTA form submission (lead converts)
# ──────────────────────────────────────────────────────────

@bp.route("/registrations/cta", methods=["POST"])
def submit_cta():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    token = data.get("token")
    form_data = data.get("form_data")

    if not session_id or not token:
        return jsonify({"error": "Campos session_id e token são obrigatórios"}), 400

    # Validate token
    regs = db.select(
        "webinar_registrations",
        filters=[
            ("session_id", f"eq.{session_id}"),
            ("access_token", f"eq.{token}"),
            ("cancelled_at", "is.null"),
        ]
    ) or []

    if not regs:
        return jsonify({"error": "Token inválido ou expirado"}), 401

    reg = regs[0]
    now = datetime.now(timezone.utc).isoformat()

    result = db.update(
        "webinar_registrations",
        filters={"id": f"eq.{reg['id']}"},
        data={
            "converted": True,
            "converted_at": now,
            "cta_response": form_data,
        }
    )
    updated = result[0] if result else {**reg, "converted": True, "converted_at": now}

    # Best-effort Pipedrive activity
    try:
        if reg.get("pipedrive_deal_id"):
            from services.pipedrive import create_activity
            create_activity(reg["pipedrive_deal_id"], "Webinar — interesse demonstrado", f"Resposta: {form_data}")
    except Exception as e:
        print(f"[cta] Pipedrive activity failed: {e}")

    return jsonify(updated), 200


# ──────────────────────────────────────────────────────────
# CSV Export
# ──────────────────────────────────────────────────────────

@bp.route("/registrations/export", methods=["GET"])
def export_registrations():
    session_id = request.args.get("session_id")

    filters = []
    if session_id:
        filters.append(("session_id", f"eq.{session_id}"))

    regs = db.select(
        "webinar_registrations",
        filters=filters or None,
        order="created_at.asc"
    ) or []

    # Fetch session info for display
    session_ids_in_regs = list({r["session_id"] for r in regs if r.get("session_id")})
    sessions_map = {}
    if session_ids_in_regs:
        ids_param = ",".join(session_ids_in_regs)
        sessions = db.select("webinar_sessions", filters={"id": f"in.({ids_param})"}) or []
        sessions_map = {s["id"]: s for s in sessions}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Nome", "Email", "Telefone", "Sessão", "Registrado em", "Presente", "Convertido"])

    for r in regs:
        session_info = sessions_map.get(r.get("session_id"), {})
        session_label = f"{session_info.get('date', '')} {session_info.get('starts_at', '')}".strip()
        writer.writerow([
            r.get("name", ""),
            r.get("email", ""),
            r.get("phone", ""),
            session_label,
            r.get("created_at", ""),
            "Sim" if r.get("attended_at") else "Não",
            "Sim" if r.get("converted") else "Não",
        ])

    csv_content = output.getvalue()
    response = make_response(csv_content)
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers["Content-Disposition"] = "attachment; filename=registrations.csv"
    return response
