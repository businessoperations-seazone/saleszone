"""Regra de negócio do FUP automático pós-webinar.

Único ponto chamado por `routes/admin.py` ao receber PATCH em registration.
Orquestra: decisão de disparo → formatação → Timelines → Slack → dedup.
"""
import logging
import re
from datetime import datetime, timezone

import supabase_client as db
from config import FUP_ALLOWED_CLOSER_SLUG, DRY_RUN_FUP, SLACK_FUP_DM_CHANNEL
from services import timelines, slack_notifier

logger = logging.getLogger(__name__)

MESSAGE_TEMPLATE = """Oi{saudacao}aqui é a Mayara da Seazone!

Obrigada por participar da call hoje. Passando aqui pra continuar nosso papo por um canal mais direto — qual foi o ponto que mais te chamou atenção na apresentação?

E se quiser, já me manda quantos leitos tem o seu imóvel que eu preparo o orçamento de enxoval pra você."""


_PHONE_DIGITS = re.compile(r"\d")


def format_message(registration):
    """Monta texto final. Usa primeiro nome se disponível, fallback genérico."""
    name = (registration.get("name") or "").strip()
    if name:
        primeiro = name.split()[0]
        saudacao = f" {primeiro}, "
    else:
        saudacao = ", "
    return MESSAGE_TEMPLATE.format(saudacao=saudacao)


def _valid_phone(phone):
    if not phone:
        return False
    digits = "".join(_PHONE_DIGITS.findall(phone))
    return len(digits) >= 10


def should_send_fup(previous, updated):
    """Decide se a transição do registration dispara o FUP.

    Regras (todas devem ser True):
      1. is_opportunity transicionou de ≠ True para True
      2. attended_at não é null
      3. fup_sent_at ainda é null
      4. phone é válido (≥ 10 dígitos)
    """
    prev_opp = previous.get("is_opportunity") is True
    new_opp = updated.get("is_opportunity") is True
    if not new_opp or prev_opp:
        return False
    if not updated.get("attended_at"):
        return False
    if updated.get("fup_sent_at"):
        return False
    if not _valid_phone(updated.get("phone")):
        return False
    return True


def get_closer_slug(session_id):
    """Busca slug do closer dono da sessão. Retorna None se não resolver."""
    if not session_id:
        return None
    sessions = db.select("webinar_sessions", filters={"id": f"eq.{session_id}"}) or []
    if not sessions:
        return None
    closer_id = sessions[0].get("closer_id")
    if not closer_id:
        return None
    closers = db.select("webinar_closers", filters={"id": f"eq.{closer_id}"}) or []
    if not closers:
        return None
    return closers[0].get("slug")


def _claim_fup_slot(reg_id, now_iso):
    """Tenta marcar fup_sent_at=now com CAS (WHERE fup_sent_at IS NULL).

    Retorna True se esta thread ganhou o slot (1 row afetada),
    False se outra thread já marcou antes (0 rows).
    """
    try:
        result = db.update(
            "webinar_registrations",
            {"id": f"eq.{reg_id}", "fup_sent_at": "is.null"},
            {"fup_sent_at": now_iso},
        )
    except Exception:
        logger.exception("fup claim slot failed for registration %s", reg_id)
        return False
    return bool(result)


def _release_fup_slot(reg_id):
    """Reverte fup_sent_at=NULL após falha no envio. Best-effort."""
    try:
        db.update(
            "webinar_registrations",
            {"id": f"eq.{reg_id}"},
            {"fup_sent_at": None},
        )
    except Exception:
        logger.exception("fup release slot failed for registration %s", reg_id)


def handle_patch_update(previous, updated, session_id):
    """Orquestra o FUP automático após PATCH de registration no admin.

    Chamado pelo handler de rota. Nunca propaga exceções — best-effort.
    """
    reg_id = updated.get("id")

    if not should_send_fup(previous, updated):
        return

    closer_slug = get_closer_slug(session_id)
    if closer_slug != FUP_ALLOWED_CLOSER_SLUG:
        logger.info(
            "fup skip registration=%s — closer %r not in whitelist",
            reg_id, closer_slug,
        )
        return

    message = format_message(updated)

    if DRY_RUN_FUP:
        preview = (
            f"[DRY RUN] FUP webinar não enviado\n"
            f"• reg_id: {reg_id}\n"
            f"• deal_id: {updated.get('pipedrive_deal_id')}\n"
            f"• mensagem:\n```\n{message}\n```"
        )
        slack_notifier.post_message(channel=SLACK_FUP_DM_CHANNEL, text=preview)
        logger.info("fup dry-run for registration=%s", reg_id)
        return

    # CAS: marca fup_sent_at ANTES do envio pra evitar race em PATCHes concorrentes.
    # Se outra thread já marcou (0 rows afetadas), aborta — ela está enviando.
    now_iso = datetime.now(timezone.utc).isoformat()
    if not _claim_fup_slot(reg_id, now_iso):
        logger.info("fup skip registration=%s — already claimed by another worker", reg_id)
        return

    chat_id = timelines.find_chat_id(updated.get("phone"))
    if not chat_id:
        # Reverte claim para permitir retry manual.
        _release_fup_slot(reg_id)
        logger.warning("fup failed registration=%s — timelines chat not found", reg_id)
        slack_notifier.post_message(
            channel=SLACK_FUP_DM_CHANNEL,
            text=f"FUP webinar FALHOU — chat Timelines não encontrado\nreg_id={reg_id}",
        )
        return

    result = timelines.send_message(chat_id=chat_id, text=message)
    if result is None:
        _release_fup_slot(reg_id)
        logger.warning("fup failed registration=%s — timelines send_message returned None", reg_id)
        slack_notifier.post_message(
            channel=SLACK_FUP_DM_CHANNEL,
            text=f"FUP webinar FALHOU no envio Timelines\nreg_id={reg_id}",
        )
        return

    logger.info("fup sent registration=%s", reg_id)
    slack_notifier.post_message(
        channel=SLACK_FUP_DM_CHANNEL,
        text=(
            f"FUP webinar enviado ✓\n"
            f"• reg_id: {reg_id}\n"
            f"• deal_id: {updated.get('pipedrive_deal_id')}"
        ),
    )
