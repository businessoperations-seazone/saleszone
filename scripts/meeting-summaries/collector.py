"""Entry point — lista, filtra e baixa transcripts do Google Drive."""

from __future__ import annotations

import json
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timedelta, timezone

from config import (
    GOOGLE_API_KEY,
    DRIVE_FOLDER_ID,
    DRIVE_API_BASE,
    MEETING_FILTERS,
    LOOKBACK_HOURS,
    PROCESSED_FILE,
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


def drive_request(endpoint: str, params: dict = None) -> dict:
    params = params or {}
    params["key"] = GOOGLE_API_KEY
    qs = urllib.parse.urlencode(params)
    url = f"{DRIVE_API_BASE}/{endpoint}?{qs}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def drive_export_text(file_id: str) -> str:
    params = {"key": GOOGLE_API_KEY, "mimeType": "text/plain"}
    qs = urllib.parse.urlencode(params)
    url = f"{DRIVE_API_BASE}/files/{file_id}/export?{qs}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8")


def matches_filter(transcript_title: str) -> bool:
    """Verifica se o titulo do transcript corresponde a uma reuniao monitorada.

    O titulo do transcript do Google Meet eh a primeira linha do documento,
    que contem o nome da reuniao do Calendar ou o codigo da sala.
    """
    title_lower = transcript_title.lower()
    for f in MEETING_FILTERS:
        if f.lower() in title_lower:
            return True
    return False


def list_new_transcripts(processed: set) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)
    cutoff_str = cutoff.strftime("%Y-%m-%dT%H:%M:%S")

    query = (
        f"'{DRIVE_FOLDER_ID}' in parents"
        f" and mimeType='application/vnd.google-apps.document'"
        f" and createdTime > '{cutoff_str}'"
        f" and trashed=false"
    )

    result = drive_request("files", {
        "q": query,
        "pageSize": "50",
        "fields": "files(id,name,createdTime)",
        "orderBy": "createdTime desc",
    })

    return [f for f in result.get("files", []) if f["id"] not in processed]


def get_meeting_name(text: str, drive_filename: str) -> str:
    """Extrai o nome da reuniao da primeira linha do transcript."""
    first_line = text.strip().split("\n")[0].strip()
    # Remove BOM se presente
    first_line = first_line.lstrip("\ufeff").strip()
    if first_line:
        return first_line
    return drive_filename


def main():
    dry_run = "--dry-run" in sys.argv
    force = "--force" in sys.argv

    log("Iniciando meeting-summaries collector...")
    processed = load_processed()

    transcripts = list_new_transcripts(processed)
    if not transcripts:
        log("Nenhum transcript novo encontrado.")
        return

    log(f"Encontrados {len(transcripts)} transcripts novos.")

    for t in transcripts:
        log(f"  Verificando: {t['name']}")

        # Baixa texto para verificar o nome real da reuniao (1a linha)
        try:
            text = drive_export_text(t["id"])
        except Exception as e:
            log(f"    ERRO ao exportar: {e}")
            continue

        meeting_name = get_meeting_name(text, t["name"])
        log(f"    Reuniao: {meeting_name}")

        if not force and not matches_filter(meeting_name):
            log(f"    Ignorado (nao corresponde a filtros)")
            continue

        if dry_run:
            log(f"    [DRY-RUN] Pulando resumo/envio.")
            processed.add(t["id"])
            save_processed(processed)
            continue

        try:
            summary = summarize_transcript(meeting_name, text)
            if summary:
                send_summary(meeting_name, summary)
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
