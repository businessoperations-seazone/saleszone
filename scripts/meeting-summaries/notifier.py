"""Formata e envia resumo de reuniao via Slack DM."""

from __future__ import annotations

import json
import time
import urllib.request

from config import SLACK_BOT_TOKEN, SLACK_DM_JP


SLACK_API = "https://slack.com/api/chat.postMessage"


def _send_message(channel: str, text: str, thread_ts: str | None = None) -> str:
    payload = {
        "channel": channel,
        "text": text,
        "unfurl_links": False,
        "unfurl_media": False,
    }
    if thread_ts:
        payload["thread_ts"] = thread_ts

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(SLACK_API, data=body, method="POST")
    req.add_header("Content-Type", "application/json; charset=utf-8")
    req.add_header("Authorization", f"Bearer {SLACK_BOT_TOKEN}")

    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
        if result.get("ok"):
            return result.get("ts", "")
        else:
            print(f"    ERRO Slack: {result.get('error')}")
            return ""


def _format_list(items: list, emoji: str = "") -> str:
    if not items:
        return "_Nenhum item._"
    lines = []
    for item in items:
        if isinstance(item, dict):
            resp = item.get("responsavel", "?")
            tarefa = item.get("tarefa", "?")
            prazo = item.get("prazo")
            prazo_str = f" (prazo: {prazo})" if prazo and prazo != "null" else ""
            lines.append(f"  {emoji} *{resp}*: {tarefa}{prazo_str}")
        else:
            lines.append(f"  {emoji} {item}")
    return "\n".join(lines)


def send_summary(meeting_name: str, summary: dict) -> None:
    header = f":memo: *Resumo: {meeting_name}*"
    ts = _send_message(SLACK_DM_JP, header)
    if not ts:
        return

    sections = [
        (":white_check_mark: *Decisoes Tomadas*", summary.get("decisoes", []), ":small_blue_diamond:"),
        (":dart: *Action Items*", summary.get("action_items", []), ":arrow_right:"),
        (":warning: *Problemas / Riscos*", summary.get("problemas", []), ":red_circle:"),
        (":star: *Destaques Positivos*", summary.get("destaques_positivos", []), ":tada:"),
        (":fast_forward: *Proximos Passos*", summary.get("proximos_passos", []), ":arrow_forward:"),
    ]

    for title, items, emoji in sections:
        time.sleep(1)
        text = f"{title}\n{_format_list(items, emoji)}"
        _send_message(SLACK_DM_JP, text, thread_ts=ts)
