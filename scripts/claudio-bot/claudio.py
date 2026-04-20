#!/usr/bin/env python3
"""
Bot Claudio — Supervisor comercial automatizado.

Consulta a API do Pipedrive, identifica deals abertos sem proxima atividade
agendada e envia alertas nos canais #warning-comercial-* do Slack.

Uso:
    python3 claudio.py --now              # Executa imediatamente (producao)
    python3 claudio.py --now --test       # Envia para #teste-dedo-duro
    python3 claudio.py --now --dry-run    # Apenas loga, nao envia nada

Todos os parametros editaveis estao em config.py.
"""

import sys
import os
import json
import logging
import time
import urllib.request
import urllib.parse
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import (
    PIPEDRIVE_API_TOKEN,
    PIPEDRIVE_DOMAIN,
    SLACK_BOT_TOKEN,
    TEST_CHANNEL,
    PIPELINES,
    EXCLUDED_OWNERS,
    PIPELINE_USERS,
    TEAM_MAP,
    MANAGERS,
    MAX_DEALS_PER_PART,
    MAX_MESSAGE_CHARS,
    SLACK_DELAY_SECONDS,
    PIPEDRIVE_RETRY_COUNT,
    PIPEDRIVE_BASE_BACKOFF,
    PIPEDRIVE_PAGE_LIMIT,
)

# ── Logging ──────────────────────────────────────────────────

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

log_file = os.path.join(LOG_DIR, f"{datetime.now().strftime('%Y-%m-%d')}.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("claudio")


# ── Pipedrive ────────────────────────────────────────────────

def pipedrive_get(endpoint, params=None):
    """GET na API do Pipedrive com retry e backoff exponencial."""
    base = f"https://api.pipedrive.com/v1/{endpoint}"
    if params is None:
        params = {}
    params["api_token"] = PIPEDRIVE_API_TOKEN
    url = f"{base}?{urllib.parse.urlencode(params)}"

    for attempt in range(PIPEDRIVE_RETRY_COUNT):
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            wait = PIPEDRIVE_BASE_BACKOFF ** (attempt + 1)
            log.warning("Pipedrive GET falhou (tentativa %d/%d): %s — retry em %ds",
                        attempt + 1, PIPEDRIVE_RETRY_COUNT, e, wait)
            if attempt + 1 == PIPEDRIVE_RETRY_COUNT:
                log.error("Pipedrive GET falhou apos %d tentativas: %s", PIPEDRIVE_RETRY_COUNT, url)
                raise
            time.sleep(wait)


def fetch_pipeline_deals(pipeline_id):
    """Busca todos os deals abertos de um pipeline, com paginacao."""
    all_deals = []
    start = 0
    while True:
        data = pipedrive_get(f"pipelines/{pipeline_id}/deals", {
            "status": "open",
            "limit": PIPEDRIVE_PAGE_LIMIT,
            "start": start,
        })
        if not data.get("success") or not data.get("data"):
            break
        all_deals.extend(data["data"])
        pagination = data.get("additional_data", {}).get("pagination", {})
        if not pagination.get("more_items_in_collection"):
            break
        start = pagination.get("next_start", start + PIPEDRIVE_PAGE_LIMIT)
    return all_deals


def fetch_activities_in_range(start_date, end_date, done=0, user_id=0, max_pages=20):
    """Paginacao /activities com filtro de data.

    Pipedrive trata end_date como EXCLUSIVO — somamos 1 dia pra fazer end_date
    inclusivo (mais intuitivo pros callers).
    """
    pd_end = (end_date + timedelta(days=1)).strftime("%Y-%m-%d")
    all_activities = []
    start = 0
    for _ in range(max_pages):
        data = pipedrive_get("activities", {
            "user_id": user_id,
            "done": done,
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": pd_end,
            "limit": PIPEDRIVE_PAGE_LIMIT,
            "start": start,
        })
        if not data.get("success") or not data.get("data"):
            break
        all_activities.extend(data["data"])
        pagination = data.get("additional_data", {}).get("pagination", {})
        if not pagination.get("more_items_in_collection"):
            break
        start = pagination.get("next_start", start + PIPEDRIVE_PAGE_LIMIT)
    return all_activities


def fetch_deal(deal_id):
    data = pipedrive_get(f"deals/{deal_id}")
    if data and data.get("success") and data.get("data"):
        return data["data"]
    return None


def fetch_deals_batch(deal_ids):
    """Fetch sequencial de deals por ID. Lento (~0.5s/deal) mas simples."""
    deals = []
    for i, did in enumerate(deal_ids):
        d = fetch_deal(did)
        if d:
            deals.append(d)
        if (i + 1) % 50 == 0:
            log.info("fetch_deals_batch: %d/%d", i + 1, len(deal_ids))
    return deals


MONITORED_PIPELINE_IDS = {p["id"] for p in PIPELINES.values()}


def fetch_lost_deals_with_overdue_activity(today, days_back=14):
    """Busca deals status=lost cuja proxima atividade (next_activity_date) esta no passado.

    Estrategia: Pipedrive nao permite filtrar /deals por next_activity_date diretamente.
    Usamos /activities com done=0 (abertas) na janela [today-days_back, yesterday]
    para encontrar deal_ids com atividade vencida, depois batch-fetch os deals
    e filtramos status=lost + pipeline monitorado.
    """
    yesterday = (today - timedelta(days=1)).replace(hour=23, minute=59, second=59, microsecond=0)
    earliest = (today - timedelta(days=days_back)).replace(hour=0, minute=0, second=0, microsecond=0)
    log.info("Buscando atividades vencidas entre %s e %s", earliest.date(), yesterday.date())

    activities = fetch_activities_in_range(earliest, yesterday, done=0, user_id=0)
    log.info("Atividades vencidas abertas: %d", len(activities))

    deal_ids = sorted({a.get("deal_id") for a in activities if a.get("deal_id")})
    log.info("Deal IDs unicos: %d", len(deal_ids))

    deals = fetch_deals_batch(deal_ids)
    lost_in_monitored = [
        d for d in deals
        if d.get("status") == "lost" and d.get("pipeline_id") in MONITORED_PIPELINE_IDS
    ]
    log.info("Lost com atividade vencida em pipelines monitorados: %d", len(lost_in_monitored))
    return lost_in_monitored


# ── Classificacao ────────────────────────────────────────────

def get_owner_name(deal):
    """Extrai o nome do owner do deal."""
    return deal.get("owner_name") or ""


def _has_next_activity(deal):
    """Retorna True se o deal tem proxima atividade agendada."""
    v = deal.get("next_activity_date")
    return v is not None and v != "" and v != "null"


def _days_overdue(next_activity_date_str):
    """Calcula dias de atraso, replicando logica do dashboard Supervisor Claudio.

    Dashboard JS: f = floor((today_midnight - next_act_end_of_day) / 86400000)
    Deal e 'overdue' quando f > 1 (atividade atrasada ha 2+ dias no calculo).
    """
    today_midnight = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    next_act_eod = datetime.fromisoformat(next_activity_date_str + "T23:59:59")
    diff_seconds = (today_midnight - next_act_eod).total_seconds()
    return int(diff_seconds // 86400)


def classify_deals(deals, pipeline_key):
    """
    Classifica deals em duas categorias, agrupados por role → owner.
    Logica alinhada com o dashboard Supervisor Claudio.

    O dashboard conta TODOS os owners nao-excluidos (lista di[]) por pipeline,
    sem filtrar por Configuracoes de usuario. O bot replica esse comportamento.

    Categorias:
      sem_atividade — next_activity_date vazio (nenhuma atividade agendada)
      atrasados     — tem next_activity_date no passado (>1 dia de atraso no calculo do dashboard)

    Retorna:
      {
        "sem_atividade": {"PV": {"Owner": [ids]}, "Closer": {"Owner": [ids]}},
        "atrasados":     {"PV": {"Owner": [ids]}, "Closer": {"Owner": [ids]}},
      }
    """
    result = {
        "sem_atividade": {"PV": {}, "Closer": {}},
        "atrasados":     {"PV": {}, "Closer": {}},
    }

    allowed_owners = PIPELINE_USERS.get(pipeline_key, set())

    for deal in deals:
        owner = get_owner_name(deal)
        if not owner or owner in EXCLUDED_OWNERS:
            continue

        # Filtro de pipeline: so contabiliza owners configurados no dashboard
        if allowed_owners and owner not in allowed_owners:
            continue

        deal_id = deal.get("id")
        has_next = _has_next_activity(deal)

        if not has_next:
            category = "sem_atividade"
        else:
            next_date = deal.get("next_activity_date")
            f = _days_overdue(next_date)
            if f > 1:
                category = "atrasados"
            else:
                continue  # atividade futura ou recente — ok

        if owner in TEAM_MAP:
            role = TEAM_MAP[owner]["role"]
        else:
            # Owner nao mapeado: atribuir role "PV" por default e logar
            role = "PV"
            log.info("Owner '%s' nao esta no TEAM_MAP — atribuido role PV (pipeline %s)",
                     owner, pipeline_key)

        # Pre-vendas nao recebe mais alerta de "sem atividade futura".
        # Why: pre-vendas trabalha com fluxo de resposta, nao follow-up agendado.
        if category == "sem_atividade" and role == "PV":
            continue

        result[category][role].setdefault(owner, []).append(deal_id)

    return result


# ── Mensagens Slack ──────────────────────────────────────────

def build_deal_link(deal_id):
    """Link clicavel para um deal no Pipedrive."""
    return f"<https://{PIPEDRIVE_DOMAIN}/deal/{deal_id}|#{deal_id}>"


CATEGORY_CONFIG = {
    "sem_atividade": {
        "emoji": ":red_circle:",
        "main_label": "Deals SEM ATIVIDADE FUTURA",
        "agent_label": "deals sem atividade futura",
    },
    "atrasados": {
        "emoji": ":large_yellow_circle:",
        "main_label": "Deals COM ATIVIDADE ATRASADA",
        "agent_label": "deals com atividade atrasada",
    },
}


def build_main_message(pipeline_name, role_label, total_deals, manager_id, category, cc_id=None):
    """Mensagem principal (1 por pipeline x role x categoria)."""
    cfg = CATEGORY_CONFIG[category]
    cc_text = f" | cc <@{cc_id}>" if cc_id else ""
    return (
        f"{cfg['emoji']} [{pipeline_name} - {role_label}] "
        f"{cfg['main_label']} — {total_deals} deals | "
        f"<@{manager_id}>{cc_text}"
    )


def build_agent_replies(owner, deals, category, part_num=None, total_parts=None):
    """Reply na thread para um agente. Retorna texto formatado."""
    info = TEAM_MAP.get(owner, {})
    slack_id = info.get("slackId", "")
    mention = f"<@{slack_id}>" if slack_id else owner
    count = len(deals)
    label = CATEGORY_CONFIG[category]["agent_label"]

    if part_num and total_parts and total_parts > 1:
        if part_num == 1:
            header = f"{mention} _{owner}_ — {count} {label} (parte {part_num}/{total_parts})"
        else:
            header = f"_{owner}_ — continuação (parte {part_num}/{total_parts})"
    else:
        header = f"{mention} _{owner}_ — {count} {label}"

    links = " · ".join(build_deal_link(d) for d in deals)
    return f"{header}\n\n{links}"


def split_agent_messages(owner, deal_ids, category):
    """Divide deals em partes se a mensagem exceder MAX_MESSAGE_CHARS."""
    # Tenta mensagem unica primeiro
    single = build_agent_replies(owner, deal_ids, category)
    if len(single) <= MAX_MESSAGE_CHARS:
        return [single]

    # Split em partes de MAX_DEALS_PER_PART
    parts = []
    for i in range(0, len(deal_ids), MAX_DEALS_PER_PART):
        chunk = deal_ids[i:i + MAX_DEALS_PER_PART]
        parts.append(chunk)

    total = len(parts)
    return [build_agent_replies(owner, parts[i], category, i + 1, total) for i in range(total)]


# ── Slack API ────────────────────────────────────────────────

def slack_post(channel, text, thread_ts=None, dry_run=False):
    """Envia mensagem no Slack. Retorna ts da mensagem ou None."""
    if dry_run:
        thread_info = f" (thread: {thread_ts})" if thread_ts else ""
        log.info("[DRY-RUN] Canal %s%s:\n%s", channel, thread_info, text)
        return "dry-run-ts"

    if not SLACK_BOT_TOKEN:
        log.error("SLACK_BOT_TOKEN vazio! Configure em config.py.")
        log.info("Mensagem que seria enviada em %s:\n%s", channel, text)
        return None

    payload = {
        "channel": channel,
        "text": text,
        "unfurl_links": False,
        "unfurl_media": False,
    }
    if thread_ts:
        payload["thread_ts"] = thread_ts

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://slack.com/api/chat.postMessage",
        data=body,
        method="POST",
    )
    req.add_header("Content-Type", "application/json; charset=utf-8")
    req.add_header("Authorization", f"Bearer {SLACK_BOT_TOKEN}")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            if result.get("ok"):
                ts = result.get("ts", "")
                log.info("Slack OK (ts: %s, canal: %s)", ts, channel)
                return ts
            else:
                log.error("Slack erro: %s (canal: %s)", result.get("error", "?"), channel)
                return None
    except Exception as e:
        log.error("Slack falhou: %s", e)
        return None


# ── Orquestracao ─────────────────────────────────────────────

def run_pipeline(pipeline_key, dry_run=False, test_mode=False, extra_deals=None):
    """Processa um pipeline completo: fetch → classify → send (2 categorias).

    extra_deals: lista opcional de deals ja filtrados (ex: lost com overdue activity)
    a serem incluidos junto dos abertos antes da classificacao.
    """
    pipeline = PIPELINES[pipeline_key]
    pipeline_id = pipeline["id"]
    pipeline_name = pipeline["name"]
    channel = TEST_CHANNEL if test_mode else pipeline["channel"]
    managers = MANAGERS.get(pipeline_key, {})

    log.info("─── %s (pipeline %d) ───", pipeline_name, pipeline_id)

    # Fetch abertos
    deals = fetch_pipeline_deals(pipeline_id)
    log.info("Deals abertos: %d", len(deals))

    # Injeta lost com atividade vencida (classify cuida de colocar em "atrasados")
    if extra_deals:
        deals.extend(extra_deals)
        log.info("+ %d lost com atividade vencida (total: %d)", len(extra_deals), len(deals))

    # Classify (retorna {"sem_atividade": {...}, "atrasados": {...}})
    classified = classify_deals(deals, pipeline_key)

    role_config = {
        "PV": {"label": "Pré-vendas", "manager": managers.get("pv")},
        "Closer": {"label": "Vendas", "manager": managers.get("vendas")},
    }
    cc_id = managers.get("cc")

    totals = {}

    for category in ("sem_atividade", "atrasados"):
        groups = classified[category]

        for role, role_info in role_config.items():
            owners = groups.get(role, {})
            if not owners:
                continue

            total = sum(len(ids) for ids in owners.values())
            totals[f"{category}_{role}"] = total
            manager_id = role_info["manager"]
            if not manager_id:
                log.warning("Sem gestor definido para %s %s", pipeline_name, role)
                continue

            # Mensagem principal
            main_msg = build_main_message(
                pipeline_name, role_info["label"], total, manager_id, category, cc_id
            )
            main_ts = slack_post(channel, main_msg, dry_run=dry_run)
            time.sleep(SLACK_DELAY_SECONDS)

            if not main_ts and not dry_run:
                log.error("Falha ao enviar msg principal — pulando replies para %s %s %s",
                           pipeline_name, role_info["label"], category)
                continue

            # Replies por agente (ordenados por qtd de deals, maior → menor)
            sorted_owners = sorted(owners.items(), key=lambda x: len(x[1]), reverse=True)

            for owner_name, deal_ids in sorted_owners:
                messages = split_agent_messages(owner_name, deal_ids, category)
                for msg in messages:
                    slack_post(channel, msg, thread_ts=main_ts, dry_run=dry_run)
                    time.sleep(SLACK_DELAY_SECONDS)

    sa_pv = totals.get("sem_atividade_PV", 0)
    sa_cl = totals.get("sem_atividade_Closer", 0)
    at_pv = totals.get("atrasados_PV", 0)
    at_cl = totals.get("atrasados_Closer", 0)
    log.info("Resumo %s: sem_atividade(PV=%d, Vendas=%d) atrasados(PV=%d, Vendas=%d)",
             pipeline_name, sa_pv, sa_cl, at_pv, at_cl)

    # Retorna dados para snapshot
    snapshot = {}
    for category in ("sem_atividade", "atrasados"):
        snapshot[category] = {}
        for role in ("PV", "Closer"):
            owners = classified[category].get(role, {})
            snapshot[category][role] = {
                "total": sum(len(ids) for ids in owners.values()),
                "owners": {name: len(ids) for name, ids in owners.items()},
            }
    return snapshot


def save_snapshot(snapshots):
    """Salva snapshot diario em snapshots/YYYY-MM-DD.json."""
    snap_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "snapshots")
    os.makedirs(snap_dir, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    data = {"date": today, "pipelines": snapshots}
    path = os.path.join(snap_dir, f"{today}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log.info("Snapshot salvo: %s", path)


def run_check(dry_run=False, test_mode=False):
    """Executa verificacao completa de todos os pipelines."""
    log.info("=" * 60)
    log.info("Claudio — Verificacao iniciada (%s)", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    if dry_run:
        log.info("MODO DRY-RUN: nenhuma mensagem sera enviada")
    if test_mode:
        log.info("MODO TESTE: mensagens enviadas para #supervisor-claudio")
    log.info("=" * 60)

    # Fetch global: lost deals com atividade vencida (1 chamada, reutilizada por todos pipelines)
    try:
        lost_overdue = fetch_lost_deals_with_overdue_activity(datetime.now())
    except Exception as e:
        log.error("Erro ao buscar lost com atividade vencida: %s", e)
        lost_overdue = []

    lost_by_pipeline = {}
    for d in lost_overdue:
        pid = d.get("pipeline_id")
        lost_by_pipeline.setdefault(pid, []).append(d)

    all_snapshots = {}
    for key in PIPELINES:
        try:
            extra = lost_by_pipeline.get(PIPELINES[key]["id"], [])
            snapshot = run_pipeline(key, dry_run=dry_run, test_mode=test_mode, extra_deals=extra)
            if snapshot:
                all_snapshots[key] = snapshot
        except Exception as e:
            log.error("Erro no pipeline %s: %s", key, e)

    # Salva snapshot diario (mesmo em dry-run, para ter historico)
    if all_snapshots:
        save_snapshot(all_snapshots)

    log.info("=" * 60)
    log.info("Claudio — Verificacao concluida")
    log.info("=" * 60)


# ── Main ─────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    test_mode = "--test" in args
    now = "--now" in args

    if not now:
        print("Uso: python3 claudio.py --now [--test] [--dry-run]")
        print("  --now       Executa imediatamente")
        print("  --test      Envia para #teste-dedo-duro")
        print("  --dry-run   Apenas loga, nao envia nada")
        sys.exit(0)

    run_check(dry_run=dry_run, test_mode=test_mode)


if __name__ == "__main__":
    main()
