#!/usr/bin/env python3
"""
Sync Fireflies transcripts → Supabase squad_calendar_events.
Roda diariamente via GitHub Actions (5h BRT).
Busca transcripts das ultimas 48h, faz matching com eventos, avalia com Claude Sonnet.
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import anthropic
import requests

# --- Config ---
FIREFLIES_URL = "https://api.fireflies.ai/graphql"
FIREFLIES_KEY = os.environ.get("FIREFLIES_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
DAYS_BACK = int(os.environ.get("DAYS_BACK", "2"))
DRY_RUN = os.environ.get("DRY_RUN", "false").lower() == "true"

BRT = timezone(timedelta(hours=-3))

CLOSERS = [
    "camila.santos", "eduardo.albani", "filipe.padoveze", "gabriela.branco",
    "gabriela.lemos", "giovanna.araujo", "laura.danieli", "luana.schaikoski",
    "maria.amaral", "maria.paul", "nevine.saratt", "priscila.pestana",
    "samuel.barreto", "willian.miranda", "caio.panissi",
]
CLOSER_EMAILS = [f"{c}@seazone.com.br" for c in CLOSERS]

# Patterns de alucinacao conhecidos
HALLUCINATION_PATTERNS = [
    "www.opusdei", "amara.org", "legendas pela comunidade",
    "obrigado por assistir", "inscreva-se no canal",
    "não se esqueça de se inscrever", "clique no sininho",
]

EVALUATION_PROMPT = """Voce e um avaliador de reunioes de vendas da Seazone. Avalie o transcript abaixo nos 5 pilares (nota 0-10 cada).

**Closer:** {closer_name}
**Empreendimento:** {empreendimento}

## 5 Pilares

### Pilar 1 — Conhecimento do Produto (peso 20%)
O closer demonstra dominio dos dados? Cita valores, tipologias, metragem, diferenciais corretamente? Penalize dados incorretos, bonifique dados precisos.
NOTA: Avalie de forma generica pois nao temos dados do empreendimento para validacao cruzada.

### Pilar 2 — Tecnicas de Venda (peso 20%)
Aplica SPIN selling? Urgencia/escassez? Ancoragem de preco? Storytelling? Tratamento de objecoes? Perguntas investigativas?

### Pilar 3 — Rapport e Empatia (peso 20%)
Escuta ativa? Personalizacao? Interesse genuino? Tom adequado? Validacao emocional?

### Pilar 4 — Foco no Call to Action (peso 20%)
Apresenta opcoes especificas? Direciona para escolha? Define proximo passo claro? Cliente saiu com compromisso?

### Pilar 5 — Objetividade (peso 20%)
Aproveita bem o tempo (~30min)? Mostra valor rapidamente? Nao se enrola? Mantem ritmo? Equilibra ouvir e falar?

## REGRAS
- Seja justo mas exigente — nota 10 e rara
- Cite trechos exatos do transcript como evidencia nas justificativas
- nota_final = media simples dos 5 pilares

## OUTPUT — Responda APENAS com JSON valido, sem markdown:
{{
  "modelo": "sonnet",
  "versao": "1.0",
  "pilares": {{
    "conhecimento_produto": {{"nota": X, "justificativa": "..."}},
    "tecnicas_venda": {{"nota": X, "justificativa": "..."}},
    "rapport_empatia": {{"nota": X, "justificativa": "..."}},
    "foco_cta": {{"nota": X, "justificativa": "..."}},
    "objetividade": {{"nota": X, "justificativa": "..."}}
  }},
  "nota_final": X.X,
  "avaliado_em": "ISO_TIMESTAMP",
  "destaques_positivos": ["...", "..."],
  "pontos_melhoria": ["...", "..."],
  "dados_incorretos": ["..."]
}}

## TRANSCRIPT:
{transcript}"""


def log(msg: str):
    print(f"[{datetime.now(BRT).strftime('%H:%M:%S')}] {msg}")


def fetch_fireflies_transcripts(days_back: int) -> list[dict]:
    """Busca transcripts do Fireflies dos ultimos N dias (paginado, 50/vez)."""
    cutoff = datetime.now(BRT) - timedelta(days=days_back)
    cutoff_ms = int(cutoff.timestamp() * 1000)

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
                sentences {
                    speaker_name
                    text
                }
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
            log(f"WARN: Fireflies API errors: {data['errors']}")
            break

        transcripts = data.get("data", {}).get("transcripts", [])
        if not transcripts:
            break

        for t in transcripts:
            if not t or not t.get("date"):
                continue
            # date vem em ms timestamp
            t_date_ms = int(t["date"])
            if t_date_ms < cutoff_ms:
                # Transcripts ordenados por data desc — se passou do cutoff, parar
                log(f"  Alcancou cutoff em skip={skip}, total={len(all_transcripts)}")
                return all_transcripts

            # Filtrar: pelo menos 1 closer nos participants
            participants = t.get("participants") or []
            participants_lower = [p.lower() for p in participants]
            has_closer = any(
                email in participants_lower for email in CLOSER_EMAILS
            )
            if has_closer:
                t["_date_ms"] = t_date_ms
                t["_participants_lower"] = participants_lower
                all_transcripts.append(t)

        skip += limit
        log(f"  Fireflies: {len(all_transcripts)} transcripts (skip={skip})")
        time.sleep(1)  # rate limit

    log(f"  Fireflies: total {len(all_transcripts)} transcripts com closers")
    return all_transcripts


def fetch_unmatched_events(days_back: int) -> list[dict]:
    """Busca eventos sem fireflies_id dos ultimos N dias (janela 7 dias)."""
    end_date = datetime.now(BRT).date()
    start_date = end_date - timedelta(days=max(days_back, 7))

    url = (
        f"{SUPABASE_URL}/rest/v1/squad_calendar_events"
        f"?select=id,titulo,dia,hora,closer_email,closer_name,empreendimento,fireflies_id,cancelou"
        f"&dia=gte.{start_date.isoformat()}"
        f"&dia=lte.{end_date.isoformat()}"
        f"&fireflies_id=is.null"
        f"&cancelou=neq.true"
    )
    resp = requests.get(
        url,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        },
        timeout=15,
    )
    resp.raise_for_status()
    events = resp.json()
    log(f"  Supabase: {len(events)} eventos sem fireflies_id ({start_date} a {end_date})")
    return events


def match_transcripts_to_events(
    transcripts: list[dict], events: list[dict]
) -> list[tuple[dict, dict]]:
    """Match transcripts com eventos por email + data + hora (tolerancia 30min)."""
    matches = []
    used_transcript_ids = set()
    used_event_ids = set()

    for event in events:
        email = (event.get("closer_email") or "").lower()
        dia = event.get("dia")  # YYYY-MM-DD
        hora = event.get("hora")  # HH:MM:SS

        if not email or not dia or not hora:
            continue

        # Parse hora do evento
        try:
            event_time = datetime.strptime(f"{dia} {hora}", "%Y-%m-%d %H:%M:%S")
        except ValueError:
            try:
                event_time = datetime.strptime(f"{dia} {hora}", "%Y-%m-%d %H:%M")
            except ValueError:
                continue

        best_match = None
        best_diff = timedelta(minutes=31)  # tolerancia 30min

        for t in transcripts:
            if t["id"] in used_transcript_ids:
                continue

            # Check email match
            if email not in t["_participants_lower"]:
                continue

            # Check date match (converter ms timestamp para date BRT)
            t_dt = datetime.fromtimestamp(t["_date_ms"] / 1000, tz=BRT)
            t_date = t_dt.strftime("%Y-%m-%d")
            if t_date != dia:
                continue

            # Check hora proximity
            t_time = datetime.strptime(
                f"{t_date} {t_dt.strftime('%H:%M:%S')}", "%Y-%m-%d %H:%M:%S"
            )
            diff = abs(event_time - t_time)
            if diff < best_diff:
                best_diff = diff
                best_match = t

        if best_match and best_match["id"] not in used_transcript_ids:
            matches.append((event, best_match))
            used_transcript_ids.add(best_match["id"])
            used_event_ids.add(event["id"])

    log(f"  Matching: {len(matches)} matches encontrados")
    return matches


def format_transcript_text(sentences: list[dict]) -> str | None:
    """Formata sentences com speaker labels. Retorna None se alucinacao."""
    if not sentences:
        return None

    lines = []
    for s in sentences:
        speaker = s.get("speaker_name", "?")
        text = (s.get("text") or "").strip()
        if text:
            lines.append(f"[{speaker}]: {text}")

    full_text = "\n".join(lines)

    # Deteccao de alucinacao
    if len(full_text) < 100:
        log("    WARN: Transcript muito curto (<100 chars) — possivel alucinacao")
        return None

    text_lower = full_text.lower()
    for pattern in HALLUCINATION_PATTERNS:
        if pattern in text_lower:
            log(f"    WARN: Alucinacao detectada (pattern: '{pattern}')")
            return None

    return full_text


def evaluate_transcript(
    transcript_text: str, closer_name: str, empreendimento: str
) -> dict | None:
    """Avalia transcript com Claude Sonnet. Retorna dict da avaliacao ou None."""
    # Truncar se muito longo (>35K chars = timeout)
    if len(transcript_text) > 35000:
        transcript_text = transcript_text[:35000] + "\n\n[... TRUNCADO ...]"

    prompt = EVALUATION_PROMPT.format(
        closer_name=closer_name or "Desconhecido",
        empreendimento=empreendimento or "Nao identificado",
        transcript=transcript_text,
    )

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text.strip()

        # Tentar parse JSON (normalizar chaves desbalanceadas)
        avaliacao = _parse_json_response(response_text)
        if not avaliacao:
            return None

        # Recalcular nota_final para garantir consistencia
        pilares = avaliacao.get("pilares", {})
        notas = [p.get("nota", 0) for p in pilares.values() if isinstance(p, dict)]
        if notas:
            avaliacao["nota_final"] = round(sum(notas) / len(notas), 1)

        # Garantir avaliado_em
        avaliacao["avaliado_em"] = datetime.now(timezone.utc).isoformat()

        return avaliacao

    except anthropic.APIError as e:
        log(f"    ERRO Claude API: {e}")
        return None
    except Exception as e:
        log(f"    ERRO avaliacao: {e}")
        return None


def _parse_json_response(text: str) -> dict | None:
    """Parse JSON da resposta do Claude, com fallback para chaves desbalanceadas."""
    # Remover markdown code blocks se presentes
    if text.startswith("```"):
        text = "\n".join(text.split("\n")[1:])
    if text.endswith("```"):
        text = "\n".join(text.split("\n")[:-1])
    text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fallback: tentar balancear chaves
    open_count = text.count("{")
    close_count = text.count("}")
    if open_count > close_count:
        text += "}" * (open_count - close_count)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    log("    WARN: Nao conseguiu parsear JSON da avaliacao")
    return None


def generate_diagnostico(avaliacao: dict) -> str:
    """Gera texto resumo: 'Nota X.X/10 | Melhor: Y | Pior: Z | melhoria'."""
    nota = avaliacao.get("nota_final", 0)
    pilares = avaliacao.get("pilares", {})

    nomes_pilares = {
        "conhecimento_produto": "Conhecimento",
        "tecnicas_venda": "Tecnicas",
        "rapport_empatia": "Rapport",
        "foco_cta": "CTA",
        "objetividade": "Objetividade",
    }

    # Melhor e pior pilar
    melhor = max(pilares.items(), key=lambda x: x[1].get("nota", 0) if isinstance(x[1], dict) else 0)
    pior = min(pilares.items(), key=lambda x: x[1].get("nota", 0) if isinstance(x[1], dict) else 10)

    melhor_nome = nomes_pilares.get(melhor[0], melhor[0])
    pior_nome = nomes_pilares.get(pior[0], pior[0])

    # Primeira melhoria
    melhorias = avaliacao.get("pontos_melhoria", [])
    melhoria_txt = melhorias[0][:80] if melhorias else "N/A"

    return f"Nota {nota}/10 | Melhor: {melhor_nome} | Pior: {pior_nome} | {melhoria_txt}"


def patch_event(event_id: int, **fields) -> bool:
    """PATCH evento no Supabase com service_role key."""
    url = f"{SUPABASE_URL}/rest/v1/squad_calendar_events?id=eq.{event_id}"
    resp = requests.patch(
        url,
        json=fields,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        timeout=15,
    )
    if resp.status_code >= 400:
        log(f"    ERRO PATCH event {event_id}: {resp.status_code} {resp.text}")
        return False
    return True


def main():
    log("=" * 60)
    log(f"Sync Fireflies — DAYS_BACK={DAYS_BACK}, DRY_RUN={DRY_RUN}")
    log("=" * 60)

    # Validar env vars
    missing = []
    if not FIREFLIES_KEY:
        missing.append("FIREFLIES_API_KEY")
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_KEY:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not ANTHROPIC_KEY:
        missing.append("ANTHROPIC_API_KEY")
    if missing:
        log(f"ERRO: Variaveis faltando: {', '.join(missing)}")
        sys.exit(1)

    # 1. Buscar transcripts do Fireflies
    log("\n1. Buscando transcripts do Fireflies...")
    transcripts = fetch_fireflies_transcripts(DAYS_BACK)
    if not transcripts:
        log("Nenhum transcript encontrado. Saindo.")
        _write_summary(0, 0, 0, 0, [])
        sys.exit(0)

    # 2. Buscar eventos sem match no Supabase
    log("\n2. Buscando eventos sem fireflies_id...")
    events = fetch_unmatched_events(DAYS_BACK)
    if not events:
        log("Nenhum evento pendente. Saindo.")
        _write_summary(len(transcripts), 0, 0, 0, [])
        sys.exit(0)

    # 3. Matching
    log("\n3. Fazendo matching transcript <-> evento...")
    matches = match_transcripts_to_events(transcripts, events)
    if not matches:
        log("Nenhum match encontrado. Saindo.")
        _write_summary(len(transcripts), len(events), 0, 0, [])
        sys.exit(0)

    # 4. Processar cada match
    log(f"\n4. Processando {len(matches)} matches...")
    results = []
    success_count = 0
    eval_count = 0

    for i, (event, transcript) in enumerate(matches, 1):
        event_id = event["id"]
        closer = event.get("closer_name") or event.get("closer_email", "?")
        emp = event.get("empreendimento") or "N/A"
        fireflies_id = transcript["id"]

        log(f"\n  [{i}/{len(matches)}] {closer} — {emp} (event={event_id}, ff={fireflies_id})")

        # 4a. Formatar transcript
        sentences = transcript.get("sentences") or []
        transcript_text = format_transcript_text(sentences)

        if DRY_RUN:
            log(f"    DRY_RUN: Transcript {'OK' if transcript_text else 'VAZIO/ALUCINACAO'} ({len(transcript_text or '')} chars)")
            results.append({"closer": closer, "emp": emp, "status": "dry_run"})
            continue

        # 4b. Se transcript vazio/alucinacao: salvar apenas fireflies_id
        if not transcript_text:
            log("    Transcript vazio/alucinacao — salvando apenas fireflies_id")
            ok = patch_event(event_id, fireflies_id=fireflies_id)
            results.append({"closer": closer, "emp": emp, "status": "skip_empty" if ok else "error"})
            if ok:
                success_count += 1
            continue

        # 4c. Avaliar com Claude
        log(f"    Avaliando ({len(transcript_text)} chars)...")
        avaliacao = evaluate_transcript(transcript_text, closer, emp)

        if avaliacao:
            diagnostico = generate_diagnostico(avaliacao)
            nota = avaliacao.get("nota_final", "?")
            log(f"    Nota: {nota}/10")
            eval_count += 1

            ok = patch_event(
                event_id,
                fireflies_id=fireflies_id,
                transcricao=transcript_text,
                avaliacao=json.dumps(avaliacao),
                diagnostico=diagnostico,
            )
        else:
            log("    Avaliacao falhou — salvando transcript sem avaliacao")
            ok = patch_event(
                event_id,
                fireflies_id=fireflies_id,
                transcricao=transcript_text,
            )

        results.append({
            "closer": closer,
            "emp": emp,
            "nota": avaliacao.get("nota_final") if avaliacao else None,
            "status": "ok" if ok else "error",
        })
        if ok:
            success_count += 1

        # Rate limit entre avaliacoes
        time.sleep(1)

    # 5. Summary
    log(f"\n{'=' * 60}")
    log(f"RESULTADO: {success_count}/{len(matches)} salvos, {eval_count} avaliados")
    _write_summary(len(transcripts), len(events), len(matches), eval_count, results)

    # Exit com erro se algum PATCH falhou
    errors = [r for r in results if r.get("status") == "error"]
    if errors:
        log(f"ERRO: {len(errors)} eventos falharam no PATCH")
        sys.exit(1)


def _write_summary(
    n_transcripts: int,
    n_events: int,
    n_matches: int,
    n_evaluated: int,
    results: list[dict],
):
    """Escreve summary para GitHub Actions UI."""
    lines = [
        "## Sync Fireflies",
        "",
        f"| Metrica | Valor |",
        f"|---------|-------|",
        f"| Transcripts Fireflies | {n_transcripts} |",
        f"| Eventos pendentes | {n_events} |",
        f"| Matches | {n_matches} |",
        f"| Avaliados com Claude | {n_evaluated} |",
        f"| DRY_RUN | {DRY_RUN} |",
        f"| DAYS_BACK | {DAYS_BACK} |",
        "",
    ]

    if results:
        lines.append("### Detalhes")
        lines.append("")
        lines.append("| Closer | Empreendimento | Nota | Status |")
        lines.append("|--------|---------------|------|--------|")
        for r in results:
            nota = f"{r.get('nota', '-')}" if r.get("nota") else "-"
            lines.append(f"| {r['closer']} | {r['emp']} | {nota} | {r['status']} |")

    summary = "\n".join(lines)
    try:
        with open("/tmp/sync_summary.txt", "w") as f:
            f.write(summary)
    except OSError:
        pass
    log(f"\n{summary}")


if __name__ == "__main__":
    main()
