"""Regra de negócio do FUP automático pós-webinar.

Único ponto chamado por `routes/admin.py` ao receber PATCH em registration.
Orquestra: decisão de disparo → formatação → Timelines → Slack → dedup.
"""
from datetime import datetime, timezone

MESSAGE_TEMPLATE = """Oi{saudacao}aqui é a Mayara da Seazone!

Obrigada por participar da call hoje. Passando aqui pra continuar nosso papo por um canal mais direto — qual foi o ponto que mais te chamou atenção na apresentação?

E se quiser, já me manda quantos leitos tem o seu imóvel que eu preparo o orçamento de enxoval pra você."""


def format_message(registration):
    """Monta texto final. Usa primeiro nome se disponível, fallback genérico."""
    name = (registration.get("name") or "").strip()
    if name:
        primeiro = name.split()[0]
        saudacao = f" {primeiro}, "
    else:
        saudacao = ", "
    return MESSAGE_TEMPLATE.format(saudacao=saudacao)


import re

_PHONE_DIGITS = re.compile(r"\d")


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
