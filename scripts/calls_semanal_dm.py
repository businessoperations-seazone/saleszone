#!/usr/bin/env python3
"""
Calls Semanal DM — Busca 1 call aleatória por closer no Fireflies (seg-sex da semana atual)
e envia DM no Slack para JP com links das transcrições.

Execução:
  DRY_RUN=true python3 calls_semanal_dm.py   # mostra mensagem sem enviar
  python3 calls_semanal_dm.py                 # envia DM
"""

from __future__ import annotations

import os
import random
import time
from datetime import datetime, timedelta, timezone

import requests

# --- Config ---
FIREFLIES_URL = "https://api.fireflies.ai/graphql"
FIREFLIES_KEY = os.environ.get("FIREFLIES_API_KEY", "")
SLACK_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")
SLACK_DM_CHANNEL = os.environ.get("SLACK_DM_CHANNEL", "D0AKXC8AJP3")  # DM JP com bot Claudio
DRY_RUN = os.environ.get("DRY_RUN", "false").lower() == "true"

BRT = timezone(timedelta(hours=-3))

FUNIS = {
    "VENDAS SPOT": {
        "emoji": ":building_construction:",
        "closers": {
            "filipe.padoveze@seazone.com.br": "Filipe Padoveze",
            "priscila.pestana@seazone.com.br": "Priscila Perrone",
            "luana.schaikoski@seazone.com.br": "Luana Schaikoski",
        },
    },
    "COMERCIAL SZS": {
        "emoji": ":house:",
        "closers": {
            "giovanna.araujo@seazone.com.br": "Giovanna Zanchetta",
            "gabriela.lemos@seazone.com.br": "Gabriela Lemos",
            "gabriela.branco@seazone.com.br": "Gabriela Branco",
            "maria.amaral@seazone.com.br": "Maria Vitoria",
        },
    },
    "COMERCIAL DECOR": {
        "emoji": ":triangular_ruler:",
        "closers": {
            "eduardo.albani@seazone.com.br": "Eduardo Albani",
            "maria.paul@seazone.com.br": "Maria Carolina Rosario",
        },
    },
}

ALL_CLOSER_EMAILS = {
    email: nome
    for funil in FUNIS.values()
    for email, nome in funil["closers"].items()
}


def log(msg: str):
    print(f"[{datetime.now(BRT).strftime('%H:%M:%S')}] {msg}")


def get_week_window() -> tuple[int, int]:
    """Retorna (segunda_ms, sexta_ms) da semana PASSADA em BRT.

    Usamos a semana anterior completa porque o job roda sexta 12h, horário em
    que a sexta atual ainda não teve todas as calls. Pegar semana passada
    garante 5 dias cheios (seg-sex) de dados."""
    now = datetime.now(BRT)
    # Segunda-feira da semana passada
    monday = now - timedelta(days=now.weekday() + 7)
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    # Sexta-feira da semana passada
    friday = monday + timedelta(days=4)
    friday = friday.replace(hour=23, minute=59, second=59, microsecond=999999)

    monday_ms = int(monday.timestamp() * 1000)
    friday_ms = int(friday.timestamp() * 1000)

    log(f"Janela: {monday.strftime('%d/%m')} (seg) a {friday.strftime('%d/%m')} (sex)")
    return monday_ms, friday_ms


def fetch_fireflies_transcripts(monday_ms: int, friday_ms: int) -> list[dict]:
    """Busca transcripts do Fireflies na janela seg-sex, filtrando por closers."""
    all_transcripts = []
    skip = 0
    limit = 50

    while True:
        query = """
        query($limit: Int, $skip: Int) {
            transcripts(limit: $limit, skip: $skip) {
                id
                title
                date
                duration
                participants
            }
        }
        """
        resp = requests.post(
            FIREFLIES_URL,
            json={"query": query, "variables": {"limit": limit, "skip": skip}},
            headers={
                "Authorization": f"Bearer {FIREFLIES_KEY}",
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        if "errors" in data:
            log(f"WARN Fireflies API errors: {data['errors']}")
            break

        transcripts = data.get("data", {}).get("transcripts", [])
        if not transcripts:
            break

        for t in transcripts:
            if not t or not t.get("date"):
                continue
            t_ms = int(t["date"])

            # Passou da segunda → parar paginação
            if t_ms < monday_ms:
                log(f"  Alcancou janela em skip={skip}, total={len(all_transcripts)}")
                return all_transcripts

            # Dentro da janela seg-sex
            if monday_ms <= t_ms <= friday_ms:
                participants = [p.lower() for p in (t.get("participants") or [])]
                closer_email = next(
                    (e for e in ALL_CLOSER_EMAILS if e in participants), None
                )
                if closer_email:
                    t["_date_ms"] = t_ms
                    t["_closer_email"] = closer_email
                    all_transcripts.append(t)

        skip += limit
        log(f"  Fireflies: {len(all_transcripts)} calls de closers (skip={skip})")
        time.sleep(0.5)

    return all_transcripts


def pick_random_per_closer(transcripts: list[dict]) -> dict[str, dict]:
    """Agrupa por closer e sorteia 1 aleatório."""
    by_closer: dict[str, list[dict]] = {}
    for t in transcripts:
        email = t["_closer_email"]
        by_closer.setdefault(email, []).append(t)

    picked = {}
    for email, calls in by_closer.items():
        picked[email] = random.choice(calls)
        log(f"  {ALL_CLOSER_EMAILS[email]}: {len(calls)} call(s) → sorteada '{picked[email]['title']}'")

    return picked


def fireflies_url(transcript: dict) -> str:
    title = (transcript.get("title") or "reuniao").strip()
    slug = (
        title.replace(" ", "-")
             .replace("|", "")
             .replace(":", "")
             .replace("  ", "-")
    )
    return f"https://app.fireflies.ai/view/{slug}::{transcript['id']}"


def format_duration(transcript: dict) -> str:
    # Fireflies retorna duration em segundos (pode vir como int ou float)
    # Tenta também o campo "meeting_attendees" duration como fallback
    val = transcript.get("duration")
    if val:
        try:
            mins = int(float(val)) // 60
            if mins > 0:
                return f"{mins} min"
        except (ValueError, TypeError):
            pass
    return ""


def format_datetime(date_ms: int) -> str:
    dt = datetime.fromtimestamp(date_ms / 1000, tz=BRT)
    dias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
    dia_semana = dias[dt.weekday()]
    return f"{dia_semana} {dt.strftime('%d/%m')} {dt.strftime('%H')}h{dt.strftime('%M') if dt.minute else ''}"


def build_message(picked: dict[str, dict], monday_ms: int, friday_ms: int) -> str:
    monday = datetime.fromtimestamp(monday_ms / 1000, tz=BRT)
    friday = datetime.fromtimestamp(friday_ms / 1000, tz=BRT)
    date_range = f"{monday.strftime('%d/%m')} a {friday.strftime('%d/%m')}"

    lines = [
        f":telephone_receiver: *Calls da Semana — {date_range}*",
        "",
    ]

    for funil_name, funil_data in FUNIS.items():
        emoji = funil_data["emoji"]
        closers = funil_data["closers"]

        lines.append("\u2501" * 24)
        lines.append(f"{emoji} *{funil_name}*")
        lines.append("\u2501" * 24)
        lines.append("")

        rank = 1
        for email, nome in closers.items():
            if email not in picked:
                lines.append(f":warning: _{nome} — sem calls esta semana_")
                lines.append("")
                continue

            t = picked[email]
            titulo = (t.get("title") or "Reunião").strip()
            data_hora = format_datetime(t["_date_ms"])
            duracao = format_duration(t)
            i = rank
            rank += 1
            url = fireflies_url(t)

            lines.append(f"{i}. *{nome}*")
            lines.append(f"   :speech_balloon: \"{titulo}\"")
            duracao_str = f" · {duracao}" if duracao else ""
            lines.append(f"   :calendar: {data_hora}{duracao_str}")
            lines.append(f"   :link: {url}")
            lines.append("")

    return "\n".join(lines)


def send_slack_dm(message: str) -> bool:
    resp = requests.post(
        "https://slack.com/api/chat.postMessage",
        json={"channel": SLACK_DM_CHANNEL, "text": message},
        headers={
            "Authorization": f"Bearer {SLACK_TOKEN}",
            "Content-Type": "application/json",
        },
        timeout=15,
    )
    data = resp.json()
    if not data.get("ok"):
        log(f"ERRO Slack: {data.get('error', 'unknown')}")
        return False
    log(f"DM enviada: ts={data.get('ts')}")
    return True


def main():
    log("=" * 60)
    log(f"Calls Semanal DM — DRY_RUN={DRY_RUN}")
    log("=" * 60)

    missing = []
    if not FIREFLIES_KEY:
        missing.append("FIREFLIES_API_KEY")
    if not SLACK_TOKEN and not DRY_RUN:
        missing.append("SLACK_BOT_TOKEN")
    if missing:
        log(f"ERRO: Variaveis faltando: {', '.join(missing)}")
        raise SystemExit(1)

    log("\n1. Calculando janela da semana...")
    monday_ms, friday_ms = get_week_window()

    log("\n2. Buscando calls no Fireflies...")
    transcripts = fetch_fireflies_transcripts(monday_ms, friday_ms)
    log(f"   {len(transcripts)} calls encontradas de closers")

    log("\n3. Sorteando 1 call por closer...")
    picked = pick_random_per_closer(transcripts)
    log(f"   {len(picked)}/{len(ALL_CLOSER_EMAILS)} closers com call")

    log("\n4. Montando mensagem...")
    message = build_message(picked, monday_ms, friday_ms)

    if DRY_RUN:
        log("\nDRY_RUN — mensagem que seria enviada:")
        log("-" * 40)
        print(message)
        log("-" * 40)
        return

    log("\n5. Enviando DM...")
    ok = send_slack_dm(message)
    if not ok:
        raise SystemExit(1)

    log("\nConcluido!")


if __name__ == "__main__":
    main()
