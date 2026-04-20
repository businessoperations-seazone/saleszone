"""Cliente HTTP para Timelines.ai (WhatsApp CRM).

Stdlib-only (urllib). Best-effort: falha silenciosamente retornando None,
não propaga exceções para caller.

Docs: app.timelines.ai → Settings → API
Base URL confirmada: https://app.timelines.ai/integrations/api
Auth: header Authorization: Bearer {token}
"""
import json
import urllib.request
import urllib.error
from config import TIMELINES_API_TOKEN, TIMELINES_WA_ACCOUNT

BASE_URL = "https://app.timelines.ai/integrations/api"


def _headers():
    return {
        "Authorization": f"Bearer {TIMELINES_API_TOKEN}",
        "Content-Type": "application/json",
    }


def find_chat_id(phone):
    """Busca chat_id numérico pelo telefone. Retorna int ou None.

    Endpoint: GET /chats?phone={phone}&per_page=1
    Formato resposta: {"status": "ok", "data": {"chats": [{"id": ...}]}}
    """
    if not TIMELINES_API_TOKEN:
        print("[timelines] TIMELINES_API_TOKEN vazio — skip find_chat_id")
        return None
    try:
        url = f"{BASE_URL}/chats?phone={phone}&per_page=1"
        req = urllib.request.Request(url, headers=_headers())
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read().decode())
        chats = body.get("data", {}).get("chats", [])
        return chats[0].get("id") if chats else None
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError) as e:
        print(f"[timelines] find_chat_id({phone}) failed: {e}")
        return None


def send_message(chat_id, text):
    """Envia mensagem pelo Timelines no chat informado.

    Endpoint: POST /chats/{chat_id}/messages
    Payload: {"text": "..."}
    Retorna dict do response ou None em erro.
    """
    if not TIMELINES_API_TOKEN:
        print("[timelines] TIMELINES_API_TOKEN vazio — skip send_message")
        return None
    try:
        url = f"{BASE_URL}/chats/{chat_id}/messages"
        body = json.dumps({"text": text}).encode()
        req = urllib.request.Request(url, data=body, headers=_headers(), method="POST")
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError) as e:
        print(f"[timelines] send_message(chat_id={chat_id}) failed: {e}")
        return None
