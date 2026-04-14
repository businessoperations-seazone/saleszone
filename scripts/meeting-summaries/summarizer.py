"""Gera resumo estruturado via Claude Code CLI (claude -p)."""

from __future__ import annotations

import json
import subprocess


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

Para cada item, seja conciso mas preciso. Use os nomes reais dos participantes quando mencionados.

## OUTPUT — Responda APENAS com JSON valido, sem markdown:
{{
  "decisoes": ["..."],
  "action_items": [{{"responsavel": "...", "tarefa": "...", "prazo": "..."}}],
  "problemas": ["..."],
  "destaques_positivos": ["..."],
  "proximos_passos": ["..."]
}}"""


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
    # Tenta encontrar o JSON dentro do texto
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    # Balance braces
    open_count = text.count("{")
    close_count = text.count("}")
    if open_count > close_count:
        text += "}" * (open_count - close_count)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    return None


def summarize_transcript(meeting_name: str, text: str) -> dict | None:
    if not text or len(text.strip()) < 100:
        return None

    prompt = PROMPT_TEMPLATE.format(
        meeting_name=meeting_name,
        transcript_text=text[:50000],
    )

    try:
        result = subprocess.run(
            ["claude", "-p", prompt, "--output-format", "text"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            print(f"    ERRO claude CLI: {result.stderr}")
            return None

        return _parse_json_response(result.stdout.strip())
    except subprocess.TimeoutExpired:
        print(f"    ERRO: timeout ao chamar claude CLI")
        return None
    except FileNotFoundError:
        print(f"    ERRO: 'claude' CLI nao encontrado no PATH")
        return None
