# Webinar FUP Automático — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disparar uma mensagem WhatsApp automática (via Timelines.ai) ao lead, assim que a closer Mayara marca uma registration de webinar como oportunidade no admin.

**Architecture:** Hook inline no handler `PATCH /api/admin/registrations/{id}` do backend Flask do webinar-platform. Detecta transição `is_opportunity: false/null → true` + `attended_at` existe + `fup_sent_at` é null + closer da sessão = Mayara. Se dry-run, loga no Slack sem enviar. Se real, envia via Timelines e grava `fup_sent_at`.

**Tech Stack:** Python 3 stdlib (`urllib`), Flask, pytest + unittest.mock, PostgreSQL (Supabase do webinar-platform `ljsvkaidlzflewnimupz`), Timelines.ai API (`https://app.timelines.ai/integrations/api`), Slack Web API.

**Spec:** `docs/superpowers/specs/2026-04-20-webinar-fup-automatico-design.md`

---

## Pré-requisitos (executar ANTES de começar)

Antes de escrever código, confirme e reúna os valores abaixo (se faltar algum, o piloto bloqueia):

- [ ] **API key Timelines da conta da Mayara** (número `+5548936182939`). Buscar em `app.timelines.ai → Settings → API`.
- [ ] **Account ID Timelines** (campo `ca_...`) — necessário para endpoints que exigem disambiguação entre múltiplas contas WhatsApp.
- [ ] **Slack bot token com acesso ao DM `D07M0MKUJUS`** (JP). Reaproveitar token já usado em `monitor-atendimento` se o workspace permitir; senão criar app novo.
- [ ] **Slug da Mayara na tabela `webinar_closers`** — rodar no Supabase SQL Editor: `SELECT slug, name FROM webinar_closers WHERE name ILIKE '%mayara%';`. Valor esperado: `mayara-marques` (confirmar).
- [ ] **Verificar se `PATCH /api/admin/registrations/{id}` já existe em alguma Edge Function Deno** em `ljsvkaidlzflewnimupz/functions/v1/webinar-api` que tenha sobrescrito o Flask. Checagem: `curl -X OPTIONS https://ljsvkaidlzflewnimupz.supabase.co/functions/v1/webinar-api/api/admin/registrations/test-id -H 'Access-Control-Request-Method: PATCH'`. Se a Edge Function tratar PATCH, este plan precisa ser adaptado para estender a Edge Function (Deno) em vez do Flask.

Se a verificação do último item confirmar que o Flask é quem trata o PATCH (o esperado pelo código atual do repo), siga o plan como está.

---

## File Structure

**Criar:**
- `scripts/webinar-platform/sql/003_add_fup_sent_at.sql` — adiciona coluna + índice
- `scripts/webinar-platform/backend/services/timelines.py` — cliente HTTP Timelines (find_chat, send_message)
- `scripts/webinar-platform/backend/services/webinar_fup.py` — decisão de disparo, formatação, orquestração (Timelines + Slack + dedup)
- `scripts/webinar-platform/backend/services/slack_notifier.py` — cliente Slack (postMessage)
- `scripts/webinar-platform/backend/tests/test_timelines.py` — unit tests do cliente Timelines
- `scripts/webinar-platform/backend/tests/test_webinar_fup.py` — unit tests do hook
- `scripts/webinar-platform/backend/tests/test_slack_notifier.py` — unit tests do Slack

**Modificar:**
- `scripts/webinar-platform/backend/config.py` — adicionar 6 env vars
- `scripts/webinar-platform/backend/routes/admin.py` — adicionar handler `PATCH /registrations/<reg_id>`
- `scripts/webinar-platform/backend/tests/test_admin.py` — adicionar casos do novo PATCH
- `scripts/webinar-platform/.env.example` (se existir; criar se não) — documentar novas vars

**Responsabilidades:**
- `services/timelines.py` = só HTTP (sem lógica de negócio; sem decisão de quando enviar).
- `services/slack_notifier.py` = só HTTP (post_message; sem formatação do payload de FUP).
- `services/webinar_fup.py` = regra de negócio (condição de disparo, template, orquestração). Ponto único que o handler chama.
- `routes/admin.py` = só roteamento + dispatch para `webinar_fup.handle_patch_update`.

---

## Chunk 1: Migration + config

### Task 1: Criar migration SQL

**Files:**
- Create: `scripts/webinar-platform/sql/003_add_fup_sent_at.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 003_add_fup_sent_at.sql
-- Coluna para dedup do FUP automático pós-webinar.
-- Setada apenas quando o envio via Timelines.ai retorna sucesso.

ALTER TABLE webinar_registrations
  ADD COLUMN IF NOT EXISTS fup_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_webinar_registrations_fup_pending
  ON webinar_registrations (is_opportunity, fup_sent_at)
  WHERE is_opportunity = true AND fup_sent_at IS NULL;
```

- [ ] **Step 2: Aplicar a migration no Supabase `ljsvkaidlzflewnimupz`**

Abrir SQL Editor em `https://supabase.com/dashboard/project/ljsvkaidlzflewnimupz/sql`, colar o conteúdo e rodar. Depois validar:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'webinar_registrations' AND column_name = 'fup_sent_at';
-- Deve retornar: fup_sent_at | timestamp with time zone
```

- [ ] **Step 3: Commit**

```bash
git add scripts/webinar-platform/sql/003_add_fup_sent_at.sql
git commit -m "feat(webinar): migration adiciona fup_sent_at para dedup do FUP automático"
```

---

### Task 2: Adicionar env vars ao config.py

**Files:**
- Modify: `scripts/webinar-platform/backend/config.py:23` (append after `MORADA_API_KEY`)

- [ ] **Step 1: Adicionar as 6 novas variáveis**

Adicionar depois da linha `MORADA_API_KEY = ...` e antes de `FLASK_PORT`:

```python
TIMELINES_API_TOKEN = os.environ.get("TIMELINES_API_TOKEN", "")
TIMELINES_WA_ACCOUNT = os.environ.get("TIMELINES_WA_ACCOUNT", "")  # ex: ca_xxxxx
SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")
SLACK_FUP_DM_CHANNEL = os.environ.get("SLACK_FUP_DM_CHANNEL", "D07M0MKUJUS")  # JP DM
FUP_ALLOWED_CLOSER_SLUG = os.environ.get("FUP_ALLOWED_CLOSER_SLUG", "mayara-marques")
DRY_RUN_FUP = os.environ.get("DRY_RUN_FUP", "true").lower() == "true"
```

**Justificativa do default `DRY_RUN_FUP=true`:** seguindo o spec, em qualquer ambiente sem configuração explícita, o sistema NÃO envia mensagens reais. Precisa ser flipado explicitamente para ligar.

- [ ] **Step 2: Atualizar `.env.example`**

Se `scripts/webinar-platform/.env.example` existir, adicionar (se não existir, criar):

```
# Timelines.ai (FUP automático webinar)
TIMELINES_API_TOKEN=
TIMELINES_WA_ACCOUNT=

# Slack (auditoria do FUP)
SLACK_BOT_TOKEN=
SLACK_FUP_DM_CHANNEL=D07M0MKUJUS

# FUP config
FUP_ALLOWED_CLOSER_SLUG=mayara-marques
DRY_RUN_FUP=true
```

- [ ] **Step 3: Commit**

```bash
git add scripts/webinar-platform/backend/config.py scripts/webinar-platform/.env.example
git commit -m "feat(webinar): adiciona env vars para Timelines + Slack + FUP config"
```

---

## Chunk 2: Cliente Timelines (TDD)

### Task 3: Cliente Timelines — `find_chat_id`

**Files:**
- Create: `scripts/webinar-platform/backend/services/timelines.py`
- Create: `scripts/webinar-platform/backend/tests/test_timelines.py`

- [ ] **Step 1: Escrever o teste falhando**

Em `backend/tests/test_timelines.py`:

```python
import json
from unittest.mock import patch, MagicMock
from io import BytesIO


def _mock_urlopen(response_body):
    """Build a context manager mock returning response_body as bytes."""
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(response_body).encode()
    mock_resp.__enter__ = lambda self: self
    mock_resp.__exit__ = lambda *a: False
    return mock_resp


def test_find_chat_id_returns_id_when_found():
    from services import timelines
    response = {"status": "ok", "data": {"chats": [{"id": 12345, "phone": "+5548999991111"}]}}
    with patch("services.timelines.TIMELINES_API_TOKEN", "tok"), \
         patch("services.timelines.urllib.request.urlopen", return_value=_mock_urlopen(response)):
        result = timelines.find_chat_id("+5548999991111")
    assert result == 12345


def test_find_chat_id_returns_none_when_empty():
    from services import timelines
    response = {"status": "ok", "data": {"chats": []}}
    with patch("services.timelines.TIMELINES_API_TOKEN", "tok"), \
         patch("services.timelines.urllib.request.urlopen", return_value=_mock_urlopen(response)):
        result = timelines.find_chat_id("+5548999999999")
    assert result is None


def test_find_chat_id_returns_none_when_no_token():
    from services import timelines
    with patch("services.timelines.TIMELINES_API_TOKEN", ""):
        result = timelines.find_chat_id("+5548999991111")
    assert result is None


def test_find_chat_id_returns_none_on_http_error():
    from services import timelines
    import urllib.error
    err = urllib.error.HTTPError("url", 500, "err", {}, None)
    with patch("services.timelines.TIMELINES_API_TOKEN", "tok"), \
         patch("services.timelines.urllib.request.urlopen", side_effect=err):
        result = timelines.find_chat_id("+5548999991111")
    assert result is None
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
cd scripts/webinar-platform/backend
python3 -m pytest tests/test_timelines.py -v
```

Esperado: ImportError / module `services.timelines` not found.

- [ ] **Step 3: Implementar `find_chat_id`**

Em `backend/services/timelines.py`:

```python
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
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python3 -m pytest tests/test_timelines.py -v
```

Esperado: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/webinar-platform/backend/services/timelines.py scripts/webinar-platform/backend/tests/test_timelines.py
git commit -m "feat(webinar): cliente Timelines.ai — find_chat_id"
```

---

### Task 4: Cliente Timelines — `send_message`

**Files:**
- Modify: `scripts/webinar-platform/backend/services/timelines.py`
- Modify: `scripts/webinar-platform/backend/tests/test_timelines.py`

- [ ] **Step 1: Escrever o teste falhando**

Adicionar em `tests/test_timelines.py`:

```python
def test_send_message_posts_to_api_and_returns_response():
    from services import timelines
    response = {"status": "ok", "data": {"message_id": "m123"}}
    with patch("services.timelines.TIMELINES_API_TOKEN", "tok"), \
         patch("services.timelines.TIMELINES_WA_ACCOUNT", "ca_xxx"), \
         patch("services.timelines.urllib.request.urlopen", return_value=_mock_urlopen(response)) as mock_urlopen:
        result = timelines.send_message(chat_id=12345, text="Olá teste")

    assert result == response
    # Verifica que urlopen foi chamado com POST e payload correto
    req = mock_urlopen.call_args[0][0]
    assert req.get_method() == "POST"
    payload = json.loads(req.data.decode())
    assert payload["text"] == "Olá teste"


def test_send_message_returns_none_without_token():
    from services import timelines
    with patch("services.timelines.TIMELINES_API_TOKEN", ""):
        result = timelines.send_message(chat_id=12345, text="hi")
    assert result is None


def test_send_message_returns_none_on_http_error():
    from services import timelines
    import urllib.error
    err = urllib.error.HTTPError("url", 403, "forbidden", {}, None)
    with patch("services.timelines.TIMELINES_API_TOKEN", "tok"), \
         patch("services.timelines.urllib.request.urlopen", side_effect=err):
        result = timelines.send_message(chat_id=12345, text="hi")
    assert result is None
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
python3 -m pytest tests/test_timelines.py::test_send_message_posts_to_api_and_returns_response -v
```

Esperado: AttributeError `send_message` not defined.

- [ ] **Step 3: Implementar `send_message`**

Acrescentar em `services/timelines.py`:

```python
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
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python3 -m pytest tests/test_timelines.py -v
```

Esperado: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/webinar-platform/backend/services/timelines.py scripts/webinar-platform/backend/tests/test_timelines.py
git commit -m "feat(webinar): cliente Timelines.ai — send_message"
```

---

## Chunk 3: Cliente Slack (TDD)

### Task 5: `slack_notifier.post_message`

**Files:**
- Create: `scripts/webinar-platform/backend/services/slack_notifier.py`
- Create: `scripts/webinar-platform/backend/tests/test_slack_notifier.py`

- [ ] **Step 1: Escrever o teste falhando**

Em `backend/tests/test_slack_notifier.py`:

```python
import json
from unittest.mock import patch, MagicMock


def _mock_urlopen(response_body):
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(response_body).encode()
    mock_resp.__enter__ = lambda self: self
    mock_resp.__exit__ = lambda *a: False
    return mock_resp


def test_post_message_sends_payload():
    from services import slack_notifier
    response = {"ok": True, "ts": "1234.5678"}
    with patch("services.slack_notifier.SLACK_BOT_TOKEN", "xoxb-test"), \
         patch("services.slack_notifier.urllib.request.urlopen", return_value=_mock_urlopen(response)) as mock_urlopen:
        result = slack_notifier.post_message(channel="D07M0MKUJUS", text="hello")
    assert result is True
    req = mock_urlopen.call_args[0][0]
    payload = json.loads(req.data.decode())
    assert payload == {"channel": "D07M0MKUJUS", "text": "hello"}
    assert req.headers["Authorization"] == "Bearer xoxb-test"


def test_post_message_returns_false_without_token():
    from services import slack_notifier
    with patch("services.slack_notifier.SLACK_BOT_TOKEN", ""):
        result = slack_notifier.post_message(channel="D07M0MKUJUS", text="hello")
    assert result is False


def test_post_message_returns_false_when_api_not_ok():
    from services import slack_notifier
    response = {"ok": False, "error": "channel_not_found"}
    with patch("services.slack_notifier.SLACK_BOT_TOKEN", "xoxb-test"), \
         patch("services.slack_notifier.urllib.request.urlopen", return_value=_mock_urlopen(response)):
        result = slack_notifier.post_message(channel="bad", text="hi")
    assert result is False
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
python3 -m pytest tests/test_slack_notifier.py -v
```

Esperado: ImportError.

- [ ] **Step 3: Implementar**

Em `services/slack_notifier.py`:

```python
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
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python3 -m pytest tests/test_slack_notifier.py -v
```

Esperado: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/webinar-platform/backend/services/slack_notifier.py scripts/webinar-platform/backend/tests/test_slack_notifier.py
git commit -m "feat(webinar): cliente Slack mínimo (post_message)"
```

---

## Chunk 4: Hook `webinar_fup` (TDD)

### Task 6: `webinar_fup.format_message`

**Files:**
- Create: `scripts/webinar-platform/backend/services/webinar_fup.py`
- Create: `scripts/webinar-platform/backend/tests/test_webinar_fup.py`

- [ ] **Step 1: Escrever o teste falhando**

Em `backend/tests/test_webinar_fup.py`:

```python
from services import webinar_fup


def test_format_message_full_name():
    result = webinar_fup.format_message({"name": "João Pedro Coutinho"})
    assert "Oi João," in result
    assert "Mayara" in result


def test_format_message_single_name():
    result = webinar_fup.format_message({"name": "Ana"})
    assert "Oi Ana," in result


def test_format_message_empty_name_uses_fallback():
    result = webinar_fup.format_message({"name": ""})
    assert result.startswith("Oi, aqui é a Mayara")


def test_format_message_none_name_uses_fallback():
    result = webinar_fup.format_message({"name": None})
    assert result.startswith("Oi, aqui é a Mayara")
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
python3 -m pytest tests/test_webinar_fup.py -v
```

Esperado: ImportError.

- [ ] **Step 3: Implementar o esqueleto do módulo + `format_message`**

Em `services/webinar_fup.py`:

```python
"""Regra de negócio do FUP automático pós-webinar.

Único ponto chamado por `routes/admin.py` ao receber PATCH em registration.
Orquestra: decisão de disparo → formatação → Timelines → Slack → dedup.
"""
from datetime import datetime, timezone

MESSAGE_TEMPLATE = """Oi {saudacao}aqui é a Mayara da Seazone!

Obrigada por participar da call hoje. Passando aqui pra continuar nosso papo por um canal mais direto — qual foi o ponto que mais te chamou atenção na apresentação?

E se quiser, já me manda quantos leitos tem o seu imóvel que eu preparo o orçamento de enxoval pra você."""


def format_message(registration):
    """Monta texto final. Usa primeiro nome se disponível, fallback genérico."""
    name = (registration.get("name") or "").strip()
    if name:
        primeiro = name.split()[0]
        saudacao = f"{primeiro}, "
    else:
        saudacao = ", "
    return MESSAGE_TEMPLATE.format(saudacao=saudacao)
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python3 -m pytest tests/test_webinar_fup.py -v
```

Esperado: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/webinar-platform/backend/services/webinar_fup.py scripts/webinar-platform/backend/tests/test_webinar_fup.py
git commit -m "feat(webinar): webinar_fup.format_message com primeiro nome + fallback"
```

---

### Task 7: `webinar_fup.should_send_fup`

**Files:**
- Modify: `scripts/webinar-platform/backend/services/webinar_fup.py`
- Modify: `scripts/webinar-platform/backend/tests/test_webinar_fup.py`

- [ ] **Step 1: Escrever os testes falhando**

Adicionar em `tests/test_webinar_fup.py`:

```python
def _base_reg(**overrides):
    base = {
        "id": "r1",
        "name": "Ana Silva",
        "phone": "+5548999991111",
        "attended_at": "2026-04-20T15:00:00Z",
        "is_opportunity": True,
        "fup_sent_at": None,
    }
    base.update(overrides)
    return base


def test_should_send_fup_happy_path():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True)
    assert webinar_fup.should_send_fup(prev, new) is True


def test_should_send_fup_false_when_no_transition():
    prev = _base_reg(is_opportunity=True)
    new = _base_reg(is_opportunity=True)
    assert webinar_fup.should_send_fup(prev, new) is False


def test_should_send_fup_false_when_opportunity_not_true():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=False)
    assert webinar_fup.should_send_fup(prev, new) is False


def test_should_send_fup_false_when_attended_at_null():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True, attended_at=None)
    assert webinar_fup.should_send_fup(prev, new) is False


def test_should_send_fup_false_when_already_sent():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True, fup_sent_at="2026-04-20T15:10:00Z")
    assert webinar_fup.should_send_fup(prev, new) is False


def test_should_send_fup_false_when_phone_empty():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True, phone="")
    assert webinar_fup.should_send_fup(prev, new) is False


def test_should_send_fup_false_when_phone_too_short():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True, phone="12345")
    assert webinar_fup.should_send_fup(prev, new) is False
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
python3 -m pytest tests/test_webinar_fup.py -v
```

Esperado: AttributeError `should_send_fup`.

- [ ] **Step 3: Implementar**

Acrescentar em `services/webinar_fup.py`:

```python
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
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python3 -m pytest tests/test_webinar_fup.py -v
```

Esperado: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/webinar-platform/backend/services/webinar_fup.py scripts/webinar-platform/backend/tests/test_webinar_fup.py
git commit -m "feat(webinar): webinar_fup.should_send_fup com todas as regras"
```

---

### Task 8: `webinar_fup.get_closer_slug`

**Files:**
- Modify: `scripts/webinar-platform/backend/services/webinar_fup.py`
- Modify: `scripts/webinar-platform/backend/tests/test_webinar_fup.py`

Busca o slug do closer responsável pela sessão do registration. É puro DB access (Supabase) isolado em função própria pra ser mockável.

- [ ] **Step 1: Escrever os testes falhando**

Adicionar em `tests/test_webinar_fup.py`:

```python
from unittest.mock import patch


def test_get_closer_slug_returns_slug_when_chain_resolves():
    with patch("services.webinar_fup.db.select") as mock_select:
        mock_select.side_effect = [
            [{"id": "sess1", "closer_id": "c1"}],  # sessions
            [{"id": "c1", "slug": "mayara-marques"}],  # closers
        ]
        result = webinar_fup.get_closer_slug("sess1")
    assert result == "mayara-marques"


def test_get_closer_slug_returns_none_when_session_missing():
    with patch("services.webinar_fup.db.select", return_value=[]):
        result = webinar_fup.get_closer_slug("missing")
    assert result is None


def test_get_closer_slug_returns_none_when_closer_id_null():
    with patch("services.webinar_fup.db.select") as mock_select:
        mock_select.side_effect = [
            [{"id": "sess1", "closer_id": None}],
        ]
        result = webinar_fup.get_closer_slug("sess1")
    assert result is None
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
python3 -m pytest tests/test_webinar_fup.py -v
```

Esperado: AttributeError `get_closer_slug`.

- [ ] **Step 3: Implementar**

Acrescentar em `services/webinar_fup.py`:

```python
import supabase_client as db


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
```

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python3 -m pytest tests/test_webinar_fup.py -v
```

Esperado: 14 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/webinar-platform/backend/services/webinar_fup.py scripts/webinar-platform/backend/tests/test_webinar_fup.py
git commit -m "feat(webinar): webinar_fup.get_closer_slug resolve session → closer"
```

---

### Task 9: `webinar_fup.handle_patch_update` — orquestração

Este é o ponto único que `routes/admin.py` chama após aplicar o update no Supabase. Integra `should_send_fup` + whitelist de closer + Timelines + Slack + dedup.

**Files:**
- Modify: `scripts/webinar-platform/backend/services/webinar_fup.py`
- Modify: `scripts/webinar-platform/backend/tests/test_webinar_fup.py`

- [ ] **Step 1: Escrever os testes falhando**

Adicionar em `tests/test_webinar_fup.py`:

```python
def test_handle_patch_skips_when_should_send_false():
    """Não chama Timelines nem Slack quando condição não é atendida."""
    prev = _base_reg(is_opportunity=True)
    new = _base_reg(is_opportunity=True)  # sem transição
    with patch("services.webinar_fup.timelines") as mock_tl, \
         patch("services.webinar_fup.slack_notifier") as mock_slack, \
         patch("services.webinar_fup.db.update") as mock_db_update:
        webinar_fup.handle_patch_update(prev, new, session_id="sess1")
    mock_tl.find_chat_id.assert_not_called()
    mock_tl.send_message.assert_not_called()
    mock_slack.post_message.assert_not_called()
    mock_db_update.assert_not_called()


def test_handle_patch_skips_when_closer_not_allowed():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True)
    with patch("services.webinar_fup.get_closer_slug", return_value="outro-closer"), \
         patch("services.webinar_fup.FUP_ALLOWED_CLOSER_SLUG", "mayara-marques"), \
         patch("services.webinar_fup.timelines") as mock_tl, \
         patch("services.webinar_fup.slack_notifier") as mock_slack:
        webinar_fup.handle_patch_update(prev, new, session_id="sess1")
    mock_tl.send_message.assert_not_called()
    mock_slack.post_message.assert_not_called()


def test_handle_patch_dry_run_logs_slack_but_does_not_send():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True)
    with patch("services.webinar_fup.get_closer_slug", return_value="mayara-marques"), \
         patch("services.webinar_fup.FUP_ALLOWED_CLOSER_SLUG", "mayara-marques"), \
         patch("services.webinar_fup.DRY_RUN_FUP", True), \
         patch("services.webinar_fup.timelines") as mock_tl, \
         patch("services.webinar_fup.slack_notifier.post_message", return_value=True) as mock_post, \
         patch("services.webinar_fup.db.update") as mock_db_update:
        webinar_fup.handle_patch_update(prev, new, session_id="sess1")
    mock_tl.find_chat_id.assert_not_called()
    mock_tl.send_message.assert_not_called()
    mock_post.assert_called_once()
    # Dry-run NÃO marca fup_sent_at
    mock_db_update.assert_not_called()


def test_handle_patch_real_sends_message_and_marks_fup_sent_at():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True)
    with patch("services.webinar_fup.get_closer_slug", return_value="mayara-marques"), \
         patch("services.webinar_fup.FUP_ALLOWED_CLOSER_SLUG", "mayara-marques"), \
         patch("services.webinar_fup.DRY_RUN_FUP", False), \
         patch("services.webinar_fup.timelines.find_chat_id", return_value=99), \
         patch("services.webinar_fup.timelines.send_message", return_value={"status": "ok"}) as mock_send, \
         patch("services.webinar_fup.slack_notifier.post_message", return_value=True) as mock_post, \
         patch("services.webinar_fup.db.update") as mock_db_update:
        webinar_fup.handle_patch_update(prev, new, session_id="sess1")
    mock_send.assert_called_once()
    args, kwargs = mock_send.call_args
    assert kwargs.get("chat_id") == 99 or args[0] == 99
    # dedup: marca fup_sent_at no banco
    mock_db_update.assert_called_once()
    update_args = mock_db_update.call_args
    assert update_args[0][0] == "webinar_registrations"
    assert "fup_sent_at" in update_args[0][2]
    mock_post.assert_called_once()


def test_handle_patch_real_no_chat_found_does_not_mark_sent():
    """Se o Timelines não achar o chat, não marca fup_sent_at — permite retry."""
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True)
    with patch("services.webinar_fup.get_closer_slug", return_value="mayara-marques"), \
         patch("services.webinar_fup.FUP_ALLOWED_CLOSER_SLUG", "mayara-marques"), \
         patch("services.webinar_fup.DRY_RUN_FUP", False), \
         patch("services.webinar_fup.timelines.find_chat_id", return_value=None), \
         patch("services.webinar_fup.timelines.send_message") as mock_send, \
         patch("services.webinar_fup.slack_notifier.post_message", return_value=True), \
         patch("services.webinar_fup.db.update") as mock_db_update:
        webinar_fup.handle_patch_update(prev, new, session_id="sess1")
    mock_send.assert_not_called()
    mock_db_update.assert_not_called()


def test_handle_patch_real_send_failure_does_not_mark_sent():
    """Se send_message retorna None (falha HTTP), não marca fup_sent_at."""
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True)
    with patch("services.webinar_fup.get_closer_slug", return_value="mayara-marques"), \
         patch("services.webinar_fup.FUP_ALLOWED_CLOSER_SLUG", "mayara-marques"), \
         patch("services.webinar_fup.DRY_RUN_FUP", False), \
         patch("services.webinar_fup.timelines.find_chat_id", return_value=99), \
         patch("services.webinar_fup.timelines.send_message", return_value=None), \
         patch("services.webinar_fup.slack_notifier.post_message", return_value=True), \
         patch("services.webinar_fup.db.update") as mock_db_update:
        webinar_fup.handle_patch_update(prev, new, session_id="sess1")
    mock_db_update.assert_not_called()
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
python3 -m pytest tests/test_webinar_fup.py -v
```

Esperado: AttributeError `handle_patch_update`.

- [ ] **Step 3: Implementar**

Acrescentar em `services/webinar_fup.py` (imports no topo do arquivo):

```python
from config import FUP_ALLOWED_CLOSER_SLUG, DRY_RUN_FUP
from services import timelines, slack_notifier
```

E a função:

```python
def handle_patch_update(previous, updated, session_id):
    """Orquestra o FUP automático após PATCH de registration no admin.

    Chamado pelo handler de rota. Nunca propaga exceções — best-effort.
    """
    if not should_send_fup(previous, updated):
        return

    closer_slug = get_closer_slug(session_id)
    if closer_slug != FUP_ALLOWED_CLOSER_SLUG:
        print(f"[webinar-fup] skip reg={updated.get('id')} — closer {closer_slug!r} ≠ whitelist {FUP_ALLOWED_CLOSER_SLUG!r}")
        return

    message = format_message(updated)

    if DRY_RUN_FUP:
        preview = (
            f"[DRY RUN] FUP webinar não enviado\n"
            f"• reg_id: {updated.get('id')}\n"
            f"• nome: {updated.get('name')}\n"
            f"• phone: {updated.get('phone')}\n"
            f"• deal_id: {updated.get('pipedrive_deal_id')}\n"
            f"• mensagem:\n```\n{message}\n```"
        )
        slack_notifier.post_message(
            channel=_slack_channel(),
            text=preview,
        )
        print(f"[webinar-fup] DRY RUN reg={updated.get('id')}")
        return

    chat_id = timelines.find_chat_id(updated.get("phone"))
    if not chat_id:
        slack_notifier.post_message(
            channel=_slack_channel(),
            text=f"FUP webinar FALHOU — chat Timelines não encontrado\nreg={updated.get('id')} phone={updated.get('phone')}",
        )
        return

    result = timelines.send_message(chat_id=chat_id, text=message)
    if result is None:
        slack_notifier.post_message(
            channel=_slack_channel(),
            text=f"FUP webinar FALHOU no envio Timelines\nreg={updated.get('id')} chat_id={chat_id}",
        )
        return

    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        db.update(
            "webinar_registrations",
            {"id": f"eq.{updated['id']}"},
            {"fup_sent_at": now_iso},
        )
    except Exception as e:
        print(f"[webinar-fup] dedup update failed: {e}")

    slack_notifier.post_message(
        channel=_slack_channel(),
        text=(
            f"FUP webinar enviado ✓\n"
            f"• reg_id: {updated.get('id')}\n"
            f"• nome: {updated.get('name')}\n"
            f"• phone: {updated.get('phone')}\n"
            f"• chat_id: {chat_id}\n"
            f"• deal_id: {updated.get('pipedrive_deal_id')}"
        ),
    )


def _slack_channel():
    from config import SLACK_FUP_DM_CHANNEL
    return SLACK_FUP_DM_CHANNEL
```

**Nota sobre a assinatura de `db.update`:** dentro de `services/webinar_fup.py` use chamada posicional `db.update("webinar_registrations", {"id": f"eq.{...}"}, {"fup_sent_at": ...})` — os asserts em `update_args[0][2]` acessam o 3º argumento posicional. Não é obrigatório usar posicional em outros arquivos (o handler em `admin.py` pode usar kwargs livremente; seus testes só verificam `assert_called_once()`).

- [ ] **Step 4: Rodar e verificar que passa**

```bash
python3 -m pytest tests/test_webinar_fup.py -v
```

Esperado: 20 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/webinar-platform/backend/services/webinar_fup.py scripts/webinar-platform/backend/tests/test_webinar_fup.py
git commit -m "feat(webinar): webinar_fup.handle_patch_update orquestra FUP + dedup"
```

---

## Chunk 5: Handler `PATCH /api/admin/registrations/<id>`

### Task 10: Handler no `routes/admin.py`

**Files:**
- Modify: `scripts/webinar-platform/backend/routes/admin.py` (adicionar novo handler)
- Modify: `scripts/webinar-platform/backend/tests/test_admin.py` (adicionar casos)

- [ ] **Step 1: Escrever os testes falhando**

Adicionar em `tests/test_admin.py`:

```python
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
    # Hook é chamado mesmo quando não há transição (ele decide internamente)
    mock_hook.assert_called_once()
    args, kwargs = mock_hook.call_args
    # previous, updated, session_id
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
```

- [ ] **Step 2: Rodar e verificar que falha**

```bash
python3 -m pytest tests/test_admin.py -v -k patch
```

Esperado: 404 / AssertionError — endpoint não existe.

- [ ] **Step 3: Implementar o handler**

Em `routes/admin.py`, adicionar no topo (com os demais imports):

```python
from services import webinar_fup
```

Adicionar o handler (posicionar logicamente perto dos outros endpoints de registration, ex.: antes do bloco CSV Export):

```python
# ──────────────────────────────────────────────────────────
# Update a registration (admin)
# ──────────────────────────────────────────────────────────

ALLOWED_UPDATE_FIELDS = {
    "status", "is_opportunity", "opportunity_marked_at",
    "no_show_at", "observacoes", "cidade", "tipo_imovel",
    "converted", "converted_at",
}


@bp.route("/registrations/<reg_id>", methods=["PATCH"])
def update_registration(reg_id):
    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({"error": "Body vazio"}), 400

    # Filtra campos permitidos
    payload = {k: v for k, v in data.items() if k in ALLOWED_UPDATE_FIELDS}
    if not payload:
        return jsonify({"error": "Nenhum campo válido no body"}), 400

    # Auto-set do timestamp quando vira oportunidade
    if payload.get("is_opportunity") is True:
        payload.setdefault("opportunity_marked_at", datetime.now(timezone.utc).isoformat())

    # Busca estado anterior (para o hook detectar transição)
    before_rows = db.select("webinar_registrations", filters={"id": f"eq.{reg_id}"}) or []
    if not before_rows:
        return jsonify({"error": "Registration não encontrada"}), 404
    previous = before_rows[0]

    result = db.update(
        "webinar_registrations",
        filters={"id": f"eq.{reg_id}"},
        data=payload,
    )
    updated = result[0] if result else {**previous, **payload}

    # Hook de FUP automático — best-effort, nunca bloqueia o response
    try:
        webinar_fup.handle_patch_update(
            previous,
            updated,
            session_id=updated.get("session_id") or previous.get("session_id"),
        )
    except Exception as e:
        print(f"[admin] webinar_fup hook failed: {e}")

    return jsonify(updated), 200
```

**Notas importantes:**
- Whitelist `ALLOWED_UPDATE_FIELDS` evita que o frontend mande campos sensíveis (email, access_token, session_id, pipedrive_deal_id).
- `status` não é coluna direta — se o frontend enviar `status: "no_show"`, o mapeamento para `no_show_at` deve ser feito. Implementação mínima atual: deixar `status` passar pelo filtro mas o backend não o usa (o próprio frontend já seta `no_show_at` direto). Se necessário, adicionar tradução `status → timestamp column` em iteração futura — fora de escopo deste spec.

- [ ] **Step 4: Rodar e verificar que os novos testes passam**

```bash
python3 -m pytest tests/test_admin.py -v -k patch
```

Esperado: 5 passed.

- [ ] **Step 5: Rodar a suite inteira para garantir que nada quebrou**

```bash
python3 -m pytest tests/ -v
```

Esperado: all green.

- [ ] **Step 6: Commit**

```bash
git add scripts/webinar-platform/backend/routes/admin.py scripts/webinar-platform/backend/tests/test_admin.py
git commit -m "feat(webinar): PATCH /api/admin/registrations/<id> com hook de FUP"
```

---

## Chunk 6: Smoke test + PR

### Task 11: Smoke test manual

Antes de abrir o PR, rodar o backend localmente com `DRY_RUN_FUP=true` e disparar um PATCH manual para verificar que:
1. Nenhum erro propaga.
2. A mensagem de DRY RUN aparece no Slack DM do JP.
3. O registro não é re-marcado como enviado (`fup_sent_at` permanece null).

- [ ] **Step 1: Subir o backend localmente**

```bash
cd scripts/webinar-platform/backend
python3 app.py &
# Aguardar "Running on http://0.0.0.0:5060"
```

- [ ] **Step 2: Escolher uma registration de teste real do Supabase**

No SQL Editor, rodar:
```sql
SELECT r.id, r.name, r.phone, r.is_opportunity, r.attended_at, r.session_id,
       s.closer_id, c.slug
FROM webinar_registrations r
JOIN webinar_sessions s ON s.id = r.session_id
LEFT JOIN webinar_closers c ON c.id = s.closer_id
WHERE r.attended_at IS NOT NULL
  AND (r.is_opportunity IS NULL OR r.is_opportunity = false)
  AND c.slug = 'mayara-marques'
LIMIT 1;
```

Anotar o `id` da registration.

- [ ] **Step 3: Disparar o PATCH com token JWT válido**

Obter token JWT de uma sessão admin logada (do frontend). Depois:

```bash
curl -X PATCH "http://localhost:5060/api/admin/registrations/<reg_id>" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"is_opportunity": true}'
```

Esperado:
- HTTP 200 com o registration atualizado.
- Mensagem no Slack DM do JP com o preview `[DRY RUN]`.
- `fup_sent_at` permanece NULL no banco (conferir com SELECT).

- [ ] **Step 4: Rollback do teste**

Reverter `is_opportunity` no banco:
```sql
UPDATE webinar_registrations
SET is_opportunity = NULL, opportunity_marked_at = NULL
WHERE id = '<reg_id>';
```

- [ ] **Step 5: Parar o backend**

```bash
pkill -f "python3 app.py"
```

---

### Task 12: Push + PR

- [ ] **Step 1: Push da branch**

```bash
git push -u origin feat/webinar-fup-automatico
```

- [ ] **Step 2: Abrir PR para revisão do Ambrosi**

```bash
gh pr create --title "feat(webinar): FUP automático pós-webinar via Timelines (piloto Mayara)" --body "$(cat <<'EOF'
## Summary
- Adiciona handler `PATCH /api/admin/registrations/<id>` no backend do webinar-platform.
- Quando a closer Mayara marca uma registration como oportunidade (e o lead esteve presente), dispara mensagem WhatsApp padrão via Timelines.ai.
- Primeira semana operando em **dry-run** (só loga no Slack DM do JP) — flipar `DRY_RUN_FUP=false` depois da validação.
- Spec: `docs/superpowers/specs/2026-04-20-webinar-fup-automatico-design.md`

## Alterações
- `sql/003_add_fup_sent_at.sql` — nova coluna + índice para dedup.
- `backend/services/timelines.py` — cliente HTTP Timelines (find_chat_id, send_message).
- `backend/services/slack_notifier.py` — cliente Slack mínimo.
- `backend/services/webinar_fup.py` — regra de negócio (decisão, template, orquestração).
- `backend/routes/admin.py` — novo handler PATCH.
- Testes unitários e de integração cobrindo as combinações do hook.

## Config necessária (.env / Supabase secrets)
- `TIMELINES_API_TOKEN` — API key da conta Timelines da Mayara.
- `TIMELINES_WA_ACCOUNT` — conta ca_xxx.
- `SLACK_BOT_TOKEN` — bot com acesso ao DM `D07M0MKUJUS`.
- `FUP_ALLOWED_CLOSER_SLUG=mayara-marques`
- `DRY_RUN_FUP=true`  ← manter em `true` no deploy inicial.

## Test plan
- [ ] Migration aplicada no Supabase `ljsvkaidlzflewnimupz`.
- [ ] Todos os testes unitários passam (`pytest tests/`).
- [ ] Smoke test manual executado em `DRY_RUN` com registration real.
- [ ] Slack recebeu preview no DM do JP.
- [ ] Depois de 1 semana em dry-run: JP + Mayara revisam amostras antes de flipar pra real.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Monitorar CI**

Se o repo tiver GitHub Actions, aguardar verde. Reportar URL do PR ao JP.

---

## Riscos durante execução (lembrete)

1. **`PATCH /admin/registrations/{id}` pode já existir em Edge Function Deno** — o pré-requisito manda verificar. Se existir, adaptar o plan para estender a Edge Function em vez do Flask.
2. **Endpoint Timelines de send pode não ser `/chats/{id}/messages`** — docs da Timelines são limitadas. Se o smoke test em produção (depois de ligar real) falhar com 404/400, inspecionar o payload no retorno do `find_chat_id` (a API pode devolver URLs relativas) e ajustar.
3. **Slack DM ID `D07M0MKUJUS`** assume que o bot já foi convidado para o DM pessoal do JP. Se não, `chat.postMessage` retorna `channel_not_found` — usar `conversations.open` antes ou postar no canal alternativo.
4. **Duplo envio em race condition**: se duas requisições PATCH chegarem ao mesmo tempo, ambas podem passar pelo check de `fup_sent_at == null` e disparar. Mitigação: dedup real é via UNIQUE constraint ou lock, fora do escopo do MVP. Se virar problema, adicionar em iteração seguinte.
