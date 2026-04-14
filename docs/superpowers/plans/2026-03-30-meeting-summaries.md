# Meeting Summaries Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automacao que baixa transcripts .docx de reunioes do Google Drive, gera resumos estruturados via Claude API e envia por Slack DM.

**Architecture:** Script Python standalone em `scripts/meeting-summaries/`. Usa Google Drive API (Service Account) para listar/baixar .docx, `python-docx` para extrair texto, Claude Sonnet para gerar resumo com 5 pilares, Slack API para enviar DM. Agendamento via launchd em horarios pos-reuniao.

**Tech Stack:** Python 3, google-auth, google-api-python-client, python-docx, anthropic, stdlib (urllib para Slack)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `scripts/meeting-summaries/config.py` | Carrega .env, define constantes (tokens, folder ID, filtros, DM ID) |
| `scripts/meeting-summaries/collector.py` | Entry point. Autentica Drive, lista .docx, filtra por nome/data, baixa |
| `scripts/meeting-summaries/summarizer.py` | Extrai texto do .docx, chama Claude API, retorna resumo estruturado |
| `scripts/meeting-summaries/notifier.py` | Formata e envia Slack DM com threading |
| `scripts/meeting-summaries/processed.json` | Estado — file IDs ja processados |
| `scripts/meeting-summaries/.env` | Tokens (GOOGLE_SERVICE_ACCOUNT_KEY_PATH, ANTHROPIC_API_KEY, SLACK_BOT_TOKEN) |
| `scripts/meeting-summaries/.gitignore` | .env, processed.json, *.docx, __pycache__ |
| `scripts/meeting-summaries/requirements.txt` | Dependencias pip |

---

## Chunk 1: Setup e Config

### Task 1: Scaffold do projeto

**Files:**
- Create: `scripts/meeting-summaries/.gitignore`
- Create: `scripts/meeting-summaries/requirements.txt`
- Create: `scripts/meeting-summaries/.env`
- Create: `scripts/meeting-summaries/config.py`

- [ ] **Step 1: Criar .gitignore**

```
.env
processed.json
*.docx
__pycache__/
```

- [ ] **Step 2: Criar requirements.txt**

```
anthropic>=0.40.0
python-docx>=1.1.0
google-auth>=2.20.0
google-api-python-client>=2.90.0
```

- [ ] **Step 3: Criar .env template**

```
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/service-account.json
ANTHROPIC_API_KEY=sk-ant-...
SLACK_BOT_TOKEN=xoxb-...
```

Preencher com os valores reais. A service account key e um arquivo JSON baixado do GCP Console.

- [ ] **Step 4: Criar config.py**

```python
"""Configuracao do meeting-summaries."""

import os
from pathlib import Path

# --- .env loader (padrao saleszone — stdlib only) ---
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

# --- Tokens ---
GOOGLE_SA_KEY_PATH = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY_PATH", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")

# --- Google Drive ---
DRIVE_FOLDER_ID = "1YtbzwYAsWUIbRKKxVADlQIVfvM1s3-3S"

# --- Filtros de reuniao ---
# Nomes que devem estar contidos no nome do arquivo .docx
MEETING_FILTERS = [
    "Daily - Comercial",
    "Weekly -",
]

# Janela de tempo: so processa arquivos criados nas ultimas N horas
LOOKBACK_HOURS = 4

# --- Slack ---
SLACK_DM_JP = "D07M0MKUJUS"

# --- Claude ---
CLAUDE_MODEL = "claude-sonnet-4-20250514"

# --- Paths ---
BASE_DIR = Path(__file__).parent
PROCESSED_FILE = BASE_DIR / "processed.json"
```

- [ ] **Step 5: Instalar dependencias**

Run: `cd ~/Claude-Code/saleszone/scripts/meeting-summaries && pip3 install -r requirements.txt`

- [ ] **Step 6: Commit**

```bash
cd ~/Claude-Code/saleszone
git add scripts/meeting-summaries/.gitignore scripts/meeting-summaries/requirements.txt scripts/meeting-summaries/config.py
git commit -m "feat(meeting-summaries): scaffold projeto com config e dependencias"
```

---

### Task 2: Configurar Google Drive API

**Files:**
- Nenhum arquivo de codigo — configuracao no GCP Console

- [ ] **Step 1: Identificar Service Account existente**

Verificar o arquivo de credenciais Google usado pelo monitor-atendimento. Se existir um SA JSON, reutilizar. Caso contrario:

1. Ir ao GCP Console (console.cloud.google.com)
2. Selecionar o projeto existente da Seazone
3. APIs & Services > Enable APIs > habilitar "Google Drive API"
4. Se nao tem SA: IAM > Service Accounts > Create > baixar JSON key

- [ ] **Step 2: Compartilhar pasta do Drive com a Service Account**

1. Copiar o email da SA do JSON (campo `client_email`)
2. Ir na pasta do Drive (https://drive.google.com/drive/u/0/folders/1YtbzwYAsWUIbRKKxVADlQIVfvM1s3-3S)
3. Compartilhar > colar email da SA > permissao "Leitor"

- [ ] **Step 3: Colocar o path do JSON no .env**

```
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/Users/joaopedrocoutinho/.config/gcloud/seazone-sa.json
```

- [ ] **Step 4: Testar autenticacao**

Run: `cd ~/Claude-Code/saleszone/scripts/meeting-summaries && python3 -c "
from google.oauth2 import service_account
from googleapiclient.discovery import build
from config import GOOGLE_SA_KEY_PATH, DRIVE_FOLDER_ID

creds = service_account.Credentials.from_service_account_file(
    GOOGLE_SA_KEY_PATH, scopes=['https://www.googleapis.com/auth/drive.readonly']
)
service = build('drive', 'v3', credentials=creds)
results = service.files().list(
    q=f\"'{DRIVE_FOLDER_ID}' in parents\",
    pageSize=5, fields='files(id, name, mimeType, createdTime)'
).execute()
for f in results.get('files', []):
    print(f['name'], f['mimeType'], f['createdTime'])
"`

Expected: Lista de arquivos da pasta do Drive (ou erro de permissao se Step 2 nao foi feito).

---

## Chunk 2: Collector (Google Drive)

### Task 3: Implementar collector.py

**Files:**
- Create: `scripts/meeting-summaries/collector.py`

- [ ] **Step 1: Criar collector.py**

```python
"""Entry point — lista, filtra e baixa transcripts do Google Drive."""

import io
import json
import sys
from datetime import datetime, timedelta, timezone

from google.oauth2 import service_account
from googleapiclient.discovery import build

from config import (
    GOOGLE_SA_KEY_PATH,
    DRIVE_FOLDER_ID,
    MEETING_FILTERS,
    LOOKBACK_HOURS,
    PROCESSED_FILE,
    BASE_DIR,
)
from summarizer import summarize_transcript
from notifier import send_summary


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


def load_processed() -> set:
    if PROCESSED_FILE.exists():
        return set(json.loads(PROCESSED_FILE.read_text()))
    return set()


def save_processed(processed: set) -> None:
    PROCESSED_FILE.write_text(json.dumps(sorted(processed), indent=2))


def matches_filter(filename: str) -> bool:
    name_lower = filename.lower()
    for f in MEETING_FILTERS:
        if f.lower() in name_lower:
            return True
    return False


def get_drive_service():
    creds = service_account.Credentials.from_service_account_file(
        GOOGLE_SA_KEY_PATH,
        scopes=["https://www.googleapis.com/auth/drive.readonly"],
    )
    return build("drive", "v3", credentials=creds)


def list_new_transcripts(service, processed: set) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)
    cutoff_str = cutoff.strftime("%Y-%m-%dT%H:%M:%S")

    query = (
        f"'{DRIVE_FOLDER_ID}' in parents"
        f" and mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'"
        f" and createdTime > '{cutoff_str}'"
        f" and trashed=false"
    )

    results = service.files().list(
        q=query,
        pageSize=50,
        fields="files(id, name, createdTime)",
        orderBy="createdTime desc",
    ).execute()

    files = results.get("files", [])
    new_files = []
    for f in files:
        if f["id"] not in processed and matches_filter(f["name"]):
            new_files.append(f)

    return new_files


def download_docx(service, file_id: str) -> bytes:
    request = service.files().get_media(fileId=file_id)
    content = io.BytesIO()
    from googleapiclient.http import MediaIoBaseDownload

    downloader = MediaIoBaseDownload(content, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return content.getvalue()


def main():
    dry_run = "--dry-run" in sys.argv

    log("Iniciando meeting-summaries collector...")
    processed = load_processed()
    service = get_drive_service()

    transcripts = list_new_transcripts(service, processed)
    if not transcripts:
        log("Nenhum transcript novo encontrado.")
        return

    log(f"Encontrados {len(transcripts)} transcripts novos.")

    for t in transcripts:
        log(f"  Processando: {t['name']}")

        if dry_run:
            log(f"    [DRY-RUN] Pulando download/resumo.")
            continue

        try:
            docx_bytes = download_docx(service, t["id"])
            log(f"    Baixado ({len(docx_bytes)} bytes)")

            summary = summarize_transcript(t["name"], docx_bytes)
            if summary:
                send_summary(t["name"], summary)
                log(f"    Resumo enviado via Slack.")
            else:
                log(f"    ERRO: falha ao gerar resumo.")
                continue

            processed.add(t["id"])
            save_processed(processed)
        except Exception as e:
            log(f"    ERRO: {e}")
            continue

    log("Concluido.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Testar listagem (dry-run)**

Run: `cd ~/Claude-Code/saleszone/scripts/meeting-summaries && python3 collector.py --dry-run`

Expected: Lista transcripts encontrados ou "Nenhum transcript novo encontrado."

- [ ] **Step 3: Commit**

```bash
cd ~/Claude-Code/saleszone
git add scripts/meeting-summaries/collector.py
git commit -m "feat(meeting-summaries): collector — lista e baixa transcripts do Drive"
```

---

## Chunk 3: Summarizer (Claude API)

### Task 4: Implementar summarizer.py

**Files:**
- Create: `scripts/meeting-summaries/summarizer.py`

- [ ] **Step 1: Criar summarizer.py**

```python
"""Extrai texto de .docx e gera resumo via Claude API."""

import io
import json

import anthropic
from docx import Document

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL


PROMPT_TEMPLATE = """Voce e um assistente que analisa transcripts de reunioes comerciais da Seazone.

Analise o transcript abaixo e gere um resumo estruturado em portugues brasileiro.

## Reuniao: {meeting_name}

## Transcript:
{transcript_text}

## Instrucoes:
Analise o transcript e retorne um JSON com exatamente estes 5 campos:

1. **decisoes**: Lista de decisoes tomadas durante a reuniao. Se nenhuma decisao foi tomada, retorne lista vazia.
2. **action_items**: Lista de action items com responsavel e prazo (se mencionado). Formato: {{"responsavel": "Nome", "tarefa": "descricao", "prazo": "data ou null"}}
3. **problemas**: Lista de problemas, bloqueios ou riscos levantados.
4. **destaques_positivos**: Lista de resultados positivos, conquistas ou boas noticias mencionadas.
5. **proximos_passos**: Lista de proximos passos ou encaminhamentos.

Para cada item, seja conciso mas preciso. Use os nomes reais dos participantes.

## OUTPUT — Responda APENAS com JSON valido, sem markdown:
{{
  "decisoes": ["..."],
  "action_items": [{{"responsavel": "...", "tarefa": "...", "prazo": "..."}}],
  "problemas": ["..."],
  "destaques_positivos": ["..."],
  "proximos_passos": ["..."]
}}"""


def extract_text(docx_bytes: bytes) -> str:
    doc = Document(io.BytesIO(docx_bytes))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


def _parse_json_response(text: str) -> dict | None:
    if text.startswith("```"):
        text = "\n".join(text.split("\n")[1:])
    if text.endswith("```"):
        text = "\n".join(text.split("\n")[:-1])
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    open_count = text.count("{")
    close_count = text.count("}")
    if open_count > close_count:
        text += "}" * (open_count - close_count)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    return None


def summarize_transcript(meeting_name: str, docx_bytes: bytes) -> dict | None:
    text = extract_text(docx_bytes)
    if not text:
        return None

    prompt = PROMPT_TEMPLATE.format(
        meeting_name=meeting_name,
        transcript_text=text[:50000],  # limit para nao estourar contexto
    )

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = message.content[0].text.strip()
        return _parse_json_response(response_text)
    except anthropic.APIError as e:
        print(f"    ERRO Claude API: {e}")
        return None
```

- [ ] **Step 2: Testar extracao de texto (se tiver um .docx de teste)**

Run: `cd ~/Claude-Code/saleszone/scripts/meeting-summaries && python3 -c "
from summarizer import extract_text
# testar com um arquivo baixado manualmente
with open('test.docx', 'rb') as f:
    text = extract_text(f.read())
print(text[:500])
print(f'Total: {len(text)} chars')
"`

- [ ] **Step 3: Commit**

```bash
cd ~/Claude-Code/saleszone
git add scripts/meeting-summaries/summarizer.py
git commit -m "feat(meeting-summaries): summarizer — extrai .docx e gera resumo via Claude"
```

---

## Chunk 4: Notifier (Slack DM)

### Task 5: Implementar notifier.py

**Files:**
- Create: `scripts/meeting-summaries/notifier.py`

- [ ] **Step 1: Criar notifier.py**

```python
"""Formata e envia resumo de reuniao via Slack DM."""

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
```

- [ ] **Step 2: Testar envio (com dados mock)**

Run: `cd ~/Claude-Code/saleszone/scripts/meeting-summaries && python3 -c "
from notifier import send_summary
send_summary('TEST - Meeting Summaries', {
    'decisoes': ['Teste de envio automatico'],
    'action_items': [{'responsavel': 'JP', 'tarefa': 'Validar automacao', 'prazo': None}],
    'problemas': [],
    'destaques_positivos': ['Automacao funcionando!'],
    'proximos_passos': ['Deploy em producao'],
})
"`

Expected: DM no Slack do JP com mensagem header + 5 replies na thread.

- [ ] **Step 3: Commit**

```bash
cd ~/Claude-Code/saleszone
git add scripts/meeting-summaries/notifier.py
git commit -m "feat(meeting-summaries): notifier — envia resumo via Slack DM com threading"
```

---

## Chunk 5: Teste end-to-end e agendamento

### Task 6: Teste end-to-end

- [ ] **Step 1: Rodar o fluxo completo**

Run: `cd ~/Claude-Code/saleszone/scripts/meeting-summaries && python3 collector.py`

Expected: Processa transcripts novos do Drive, gera resumo, envia Slack DM. Se nao tem transcripts recentes, testar ampliando LOOKBACK_HOURS temporariamente.

- [ ] **Step 2: Validar resumo no Slack**

Verificar que a mensagem chegou no DM com os 5 pilares formatados corretamente.

### Task 7: Configurar launchd

**Files:**
- Create: `~/Library/LaunchAgents/com.seazone.meeting-summaries-daily.plist`
- Create: `~/Library/LaunchAgents/com.seazone.meeting-summaries-weekly.plist`

- [ ] **Step 1: Criar plist para dailies (seg-sex 11:30)**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.seazone.meeting-summaries-daily</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>/Users/joaopedrocoutinho/Claude-Code/saleszone/scripts/meeting-summaries/collector.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/joaopedrocoutinho/Claude-Code/saleszone/scripts/meeting-summaries</string>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Weekday</key><integer>1</integer>
            <key>Hour</key><integer>11</integer>
            <key>Minute</key><integer>30</integer>
        </dict>
        <dict>
            <key>Weekday</key><integer>2</integer>
            <key>Hour</key><integer>11</integer>
            <key>Minute</key><integer>30</integer>
        </dict>
        <dict>
            <key>Weekday</key><integer>3</integer>
            <key>Hour</key><integer>11</integer>
            <key>Minute</key><integer>30</integer>
        </dict>
        <dict>
            <key>Weekday</key><integer>4</integer>
            <key>Hour</key><integer>11</integer>
            <key>Minute</key><integer>30</integer>
        </dict>
        <dict>
            <key>Weekday</key><integer>5</integer>
            <key>Hour</key><integer>11</integer>
            <key>Minute</key><integer>30</integer>
        </dict>
    </array>
    <key>StandardOutPath</key>
    <string>/Users/joaopedrocoutinho/Library/Logs/meeting-summaries-daily.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/joaopedrocoutinho/Library/Logs/meeting-summaries-daily.log</string>
</dict>
</plist>
```

- [ ] **Step 2: Criar plist para weeklies (seg 18:00, ter 15:30 e 18:30)**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.seazone.meeting-summaries-weekly</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>/Users/joaopedrocoutinho/Claude-Code/saleszone/scripts/meeting-summaries/collector.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/joaopedrocoutinho/Claude-Code/saleszone/scripts/meeting-summaries</string>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Weekday</key><integer>1</integer>
            <key>Hour</key><integer>18</integer>
            <key>Minute</key><integer>0</integer>
        </dict>
        <dict>
            <key>Weekday</key><integer>2</integer>
            <key>Hour</key><integer>15</integer>
            <key>Minute</key><integer>30</integer>
        </dict>
        <dict>
            <key>Weekday</key><integer>2</integer>
            <key>Hour</key><integer>18</integer>
            <key>Minute</key><integer>30</integer>
        </dict>
    </array>
    <key>StandardOutPath</key>
    <string>/Users/joaopedrocoutinho/Library/Logs/meeting-summaries-weekly.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/joaopedrocoutinho/Library/Logs/meeting-summaries-weekly.log</string>
</dict>
</plist>
```

- [ ] **Step 3: Carregar os LaunchAgents**

Run:
```bash
launchctl load ~/Library/LaunchAgents/com.seazone.meeting-summaries-daily.plist
launchctl load ~/Library/LaunchAgents/com.seazone.meeting-summaries-weekly.plist
```

- [ ] **Step 4: Registrar no automations-hub config.json**

Adicionar a nova automacao no `config.json` do automations-hub para que apareca no dashboard.

- [ ] **Step 5: Commit final**

```bash
cd ~/Claude-Code/saleszone
git add scripts/meeting-summaries/
git commit -m "feat(meeting-summaries): automacao completa — Drive > Claude > Slack DM"
```
