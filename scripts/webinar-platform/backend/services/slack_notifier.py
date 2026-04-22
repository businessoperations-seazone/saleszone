"""Cliente mínimo para Slack Web API — só o suficiente para postMessage.

Stdlib-only. Usado para auditoria do FUP automático do webinar.
"""
import json
import urllib.request
import urllib.error
from config import SLACK_BOT_TOKEN

SLACK_API = "https://slack.com/api"


def post_message(channel, text):
    """Envia mensagem pro Slack. Retorna True em sucesso, False em erro.

    Best-effort — não propaga exceções. Loga falha em stdout.
    """
    if not SLACK_BOT_TOKEN:
        print("[slack] SLACK_BOT_TOKEN vazio — skip post_message")
        return False
    try:
        url = f"{SLACK_API}/chat.postMessage"
        body = json.dumps({"channel": channel, "text": text}).encode()
        headers = {
            "Authorization": f"Bearer {SLACK_BOT_TOKEN}",
            "Content-Type": "application/json; charset=utf-8",
        }
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
        if not data.get("ok"):
            print(f"[slack] post_message failed: {data.get('error')}")
            return False
        return True
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError) as e:
        print(f"[slack] post_message failed: {e}")
        return False
