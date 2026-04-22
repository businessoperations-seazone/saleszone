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
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")

# --- Google Drive ---
DRIVE_FOLDER_ID = "1YtbzwYAsWUIbRKKxVADlQIVfvM1s3-3S"
DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"

# --- Filtros de reuniao ---
# Nomes de reunioes no Calendar que devem ser processadas
MEETING_FILTERS = [
    "daily - comercial",
    "weekly -",
]

# Janela de tempo: so processa arquivos criados nas ultimas N horas
LOOKBACK_HOURS = 4

# --- Slack ---
SLACK_DM_JP = "D0AKXC8AJP3"

# --- Paths ---
BASE_DIR = Path(__file__).parent
PROCESSED_FILE = BASE_DIR / "processed.json"
