#!/usr/bin/env python3
"""
Bot Claudio — Warnings extras (losts e reativacao).

Dois modos:
  --dia sexta    Losts da semana (seg-sex) sem atividade futura  [sexta-feira]
  --dia diario   Deals status=lost com atividade programada para HOJE  [seg-sex]

Uso:
    python3 warning_semanal.py --now --dia sexta
    python3 warning_semanal.py --now --dia diario
    python3 warning_semanal.py --now --dia sexta --test        # envia para DM JP
    python3 warning_semanal.py --now --dia sexta --dry-run
"""

import sys
import os
import logging
import time
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import (
    PIPELINES,
    EXCLUDED_OWNERS,
    PIPELINE_USERS,
    TEAM_MAP,
    MANAGERS,
    MAX_DEALS_PER_PART,
    MAX_MESSAGE_CHARS,
    SLACK_DELAY_SECONDS,
    PIPEDRIVE_PAGE_LIMIT,
)
from claudio import (
    pipedrive_get,
    slack_post,
    build_deal_link,
    _has_next_activity,
    fetch_activities_in_range,
    fetch_deals_batch,
    get_inactive_user_ids,
    MONITORED_PIPELINE_IDS,
    EX_OWNER_MARKER,
)

# ── Logging ──
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(LOG_DIR, exist_ok=True)
log_file = os.path.join(LOG_DIR, f"warning-semanal-{datetime.now().strftime('%Y-%m-%d')}.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    handlers=[logging.FileHandler(log_file, encoding="utf-8"), logging.StreamHandler()],
)
log = logging.getLogger("warning-semanal")


# ── Canal de teste (DM do JP com bot Claudio) ──
DM_JP_CHANNEL = "D0AKXC8AJP3"

PIPELINE_KEY_BY_ID = {p["id"]: key for key, p in PIPELINES.items()}


# ── Helpers puros (testaveis) ────────────────────────────────

def get_date_range(today, dia):
    """Retorna (start, end) conforme o modo.

    dia='sexta' : (segunda desta semana 00:00:00, today) — semana trabalhada ate agora
    dia='diario': (today 00:00:00, today 23:59:59) — somente hoje
    """
    if dia not in ("sexta", "diario"):
        raise ValueError(f"dia invalido: {dia!r} — esperado 'sexta' ou 'diario'")

    if dia == "sexta":
        weekday = today.weekday()  # Mon=0, Fri=4
        monday = (today - timedelta(days=weekday)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        return (monday, today)
    start = today.replace(hour=0, minute=0, second=0, microsecond=0)
    end = today.replace(hour=23, minute=59, second=59, microsecond=0)
    return (start, end)


def _parse_pipedrive_datetime(s):
    """Pipedrive usa 'YYYY-MM-DD HH:MM:SS' (UTC) ou 'YYYY-MM-DD' para dates."""
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def filter_losts_sem_atividade(deals, week_start, week_end):
    """Warning sexta: status=lost, lost_time na janela, sem next_activity, pipeline monitorado."""
    result = []
    for d in deals:
        if d.get("status") != "lost":
            continue
        if d.get("pipeline_id") not in MONITORED_PIPELINE_IDS:
            continue
        if _has_next_activity(d):
            continue
        lt = _parse_pipedrive_datetime(d.get("lost_time"))
        if lt is None:
            continue
        if lt < week_start or lt > week_end:
            continue
        result.append(d)
    return result


def filter_reativacao(deals):
    """Warning segunda: status=lost + pipeline monitorado (os deals ja vieram das atividades da semana)."""
    result = []
    for d in deals:
        if d.get("status") != "lost":
            continue
        if d.get("pipeline_id") not in MONITORED_PIPELINE_IDS:
            continue
        result.append(d)
    return result


def classify_by_role(deals, pipeline_key, inactive_user_ids=None):
    """Agrupa deals por role (PV/Closer) x owner, respeitando EXCLUDED_OWNERS e PIPELINE_USERS.

    Quando inactive_user_ids e passado e o owner do deal esta la, o deal cai no
    bucket EX_OWNER_MARKER (bypassa PIPELINE_USERS) — gestor redistribui.
    """
    result = {"PV": {}, "Closer": {}}
    inactive_user_ids = inactive_user_ids or set()
    allowed = PIPELINE_USERS.get(pipeline_key, set())
    for d in deals:
        owner = d.get("owner_name") or ""
        if not owner or owner in EXCLUDED_OWNERS:
            continue
        user_id = d.get("user_id")
        if isinstance(user_id, dict):
            user_id = user_id.get("id")
        is_inactive = user_id in inactive_user_ids

        if not is_inactive and allowed and owner not in allowed:
            continue

        if owner in TEAM_MAP:
            role = TEAM_MAP[owner]["role"]
        elif is_inactive:
            role = "PV"
        else:
            role = "PV"
            log.info(
                "Owner '%s' nao esta no TEAM_MAP — atribuido role PV (pipeline %s)",
                owner,
                pipeline_key,
            )
        bucket = EX_OWNER_MARKER if is_inactive else owner
        result[role].setdefault(bucket, []).append(d.get("id"))
    return result


# ── Mensagens Slack ──

CATEGORY_CONFIG_SEMANAL = {
    "losts_semana": {
        "emoji": ":black_circle:",
        "main_label": "Losts da semana SEM ATIVIDADE FUTURA",
        "agent_label": "losts sem atividade futura",
    },
    "reativacao": {
        "emoji": ":large_blue_circle:",
        "main_label": "Deals PERDIDOS com ATIVIDADE NA SEMANA (reativar)",
        "agent_label": "deals para reativar",
    },
}


def build_main_message_semanal(pipeline_name, role_label, total, manager_id, category, cc_id=None):
    cfg = CATEGORY_CONFIG_SEMANAL[category]
    cc_text = f" | cc <@{cc_id}>" if cc_id else ""
    return (
        f"{cfg['emoji']} [{pipeline_name} - {role_label}] "
        f"{cfg['main_label']} — {total} deals | "
        f"<@{manager_id}>{cc_text}"
    )


def build_agent_reply(owner, deal_ids, category, part_num=None, total_parts=None, manager_id=None):
    if owner == EX_OWNER_MARKER:
        mention = f"<@{manager_id}>" if manager_id else "(gestor)"
        display = "Ex-funcionários (distribuir)"
    else:
        info = TEAM_MAP.get(owner, {})
        slack_id = info.get("slackId", "")
        mention = f"<@{slack_id}>" if slack_id else owner
        display = owner
    count = len(deal_ids)
    label = CATEGORY_CONFIG_SEMANAL[category]["agent_label"]
    if part_num and total_parts and total_parts > 1:
        if part_num == 1:
            header = f"{mention} _{display}_ — {count} {label} (parte {part_num}/{total_parts})"
        else:
            header = f"_{display}_ — continuacao (parte {part_num}/{total_parts})"
    else:
        header = f"{mention} _{display}_ — {count} {label}"
    links = " · ".join(build_deal_link(d) for d in deal_ids)
    return f"{header}\n\n{links}"


def split_agent_messages(owner, deal_ids, category, manager_id=None):
    single = build_agent_reply(owner, deal_ids, category, manager_id=manager_id)
    if len(single) <= MAX_MESSAGE_CHARS:
        return [single]
    parts = [deal_ids[i:i + MAX_DEALS_PER_PART] for i in range(0, len(deal_ids), MAX_DEALS_PER_PART)]
    total = len(parts)
    return [build_agent_reply(owner, parts[i], category, i + 1, total, manager_id=manager_id)
            for i in range(total)]


# ── Pipedrive fetchers ──

def fetch_lost_deals_recent(week_start, max_pages=10):
    """Paginacao /deals?status=lost&sort=update_time DESC com stop early."""
    all_deals = []
    start = 0
    consecutive_old = 0
    for _ in range(max_pages):
        data = pipedrive_get(
            "deals",
            {
                "status": "lost",
                "sort": "update_time DESC",
                "limit": PIPEDRIVE_PAGE_LIMIT,
                "start": start,
            },
        )
        if not data.get("success") or not data.get("data"):
            break
        batch = data["data"]
        all_deals.extend(batch)

        # Se a pagina inteira tem lost_time anterior ao week_start, estamos fora da janela.
        max_lost = None
        for d in batch:
            lt = _parse_pipedrive_datetime(d.get("lost_time"))
            if lt and (max_lost is None or lt > max_lost):
                max_lost = lt
        if max_lost is not None and max_lost < week_start:
            consecutive_old += 1
            if consecutive_old >= 2:
                log.info("Stop early — 2 paginas consecutivas antes de week_start")
                break
        else:
            consecutive_old = 0

        pagination = data.get("additional_data", {}).get("pagination", {})
        if not pagination.get("more_items_in_collection"):
            break
        start = pagination.get("next_start", start + PIPEDRIVE_PAGE_LIMIT)
    return all_deals


# ── Orquestracao ──

def _send_pipeline_block(pipeline_key, classified, channel, category, dry_run):
    pipeline_name = PIPELINES[pipeline_key]["name"]
    managers = MANAGERS.get(pipeline_key, {})
    role_config = {
        "PV": {"label": "Pré-vendas", "manager": managers.get("pv")},
        "Closer": {"label": "Vendas", "manager": managers.get("vendas")},
    }
    cc_id = managers.get("cc")
    totals = {}
    for role, role_info in role_config.items():
        owners = classified.get(role, {})
        if not owners:
            continue
        total = sum(len(ids) for ids in owners.values())
        totals[role] = total
        manager_id = role_info["manager"]
        if not manager_id:
            log.warning("Sem gestor para %s %s", pipeline_name, role)
            continue
        main_msg = build_main_message_semanal(
            pipeline_name, role_info["label"], total, manager_id, category, cc_id
        )
        main_ts = slack_post(channel, main_msg, dry_run=dry_run)
        time.sleep(SLACK_DELAY_SECONDS)
        if not main_ts and not dry_run:
            continue
        sorted_owners = sorted(owners.items(), key=lambda x: len(x[1]), reverse=True)
        for owner_name, deal_ids in sorted_owners:
            for msg in split_agent_messages(owner_name, deal_ids, category, manager_id=manager_id):
                slack_post(channel, msg, thread_ts=main_ts, dry_run=dry_run)
                time.sleep(SLACK_DELAY_SECONDS)
    return totals


def _fetch_inactives():
    try:
        ids = get_inactive_user_ids()
        log.info("Ex-funcionarios (active_flag=False): %d", len(ids))
        return ids
    except Exception as e:
        log.error("Erro ao buscar users: %s", e)
        return set()


def run_sexta(today, dry_run=False, test_mode=False):
    week_start, week_end = get_date_range(today, "sexta")
    log.info("Warning SEXTA — losts entre %s e %s", week_start, week_end)
    inactive_ids = _fetch_inactives()
    all_deals = fetch_lost_deals_recent(week_start)
    log.info("Fetched %d lost deals recentes (pre-filtro)", len(all_deals))
    filtered = filter_losts_sem_atividade(all_deals, week_start, week_end)
    log.info("Apos filtro: %d deals", len(filtered))

    by_pipeline = {}
    for d in filtered:
        key = PIPELINE_KEY_BY_ID.get(d.get("pipeline_id"))
        if key:
            by_pipeline.setdefault(key, []).append(d)

    for pipeline_key, deals in by_pipeline.items():
        classified = classify_by_role(deals, pipeline_key, inactive_user_ids=inactive_ids)
        channel = DM_JP_CHANNEL if test_mode else PIPELINES[pipeline_key]["channel"]
        totals = _send_pipeline_block(pipeline_key, classified, channel, "losts_semana", dry_run)
        log.info("Pipeline %s losts_semana: %s", pipeline_key, totals)


def run_diario(today, dry_run=False, test_mode=False):
    day_start, day_end = get_date_range(today, "diario")
    log.info("Warning DIARIO — atividades de hoje %s", day_start.date())
    inactive_ids = _fetch_inactives()
    activities = fetch_activities_in_range(day_start, day_end)
    log.info("Fetched %d atividades abertas de hoje", len(activities))

    deal_ids = sorted({a.get("deal_id") for a in activities if a.get("deal_id")})
    log.info("Deal IDs unicos: %d", len(deal_ids))

    deals = fetch_deals_batch(deal_ids)
    log.info("Fetched %d deals completos", len(deals))

    filtered = filter_reativacao(deals)
    log.info("Apos filtro (status=lost + pipeline monitorado): %d deals", len(filtered))

    by_pipeline = {}
    for d in filtered:
        key = PIPELINE_KEY_BY_ID.get(d.get("pipeline_id"))
        if key:
            by_pipeline.setdefault(key, []).append(d)

    for pipeline_key, deals in by_pipeline.items():
        classified = classify_by_role(deals, pipeline_key, inactive_user_ids=inactive_ids)
        channel = DM_JP_CHANNEL if test_mode else PIPELINES[pipeline_key]["channel"]
        totals = _send_pipeline_block(pipeline_key, classified, channel, "reativacao", dry_run)
        log.info("Pipeline %s reativacao: %s", pipeline_key, totals)


# ── Main ──

def main():
    args = sys.argv[1:]
    if "--now" not in args:
        print("Uso: python3 warning_semanal.py --now --dia sexta|diario [--test] [--dry-run]")
        print("  --dia sexta     Losts da semana sem atividade futura (sexta-feira)")
        print("  --dia diario    Deals lost com atividade para HOJE (seg-sex)")
        print("  --test          Envia para DM do JP")
        print("  --dry-run       Apenas loga")
        sys.exit(0)
    dry_run = "--dry-run" in args
    test_mode = "--test" in args
    dia = None
    if "--dia" in args:
        i = args.index("--dia")
        if i + 1 < len(args):
            dia = args[i + 1]
    if dia not in ("sexta", "diario"):
        print("Erro: --dia deve ser 'sexta' ou 'diario'")
        sys.exit(1)

    log.info("=" * 60)
    log.info("Warning extra — dia=%s dry_run=%s test_mode=%s", dia, dry_run, test_mode)
    log.info("=" * 60)
    today = datetime.now()
    if dia == "sexta":
        run_sexta(today, dry_run=dry_run, test_mode=test_mode)
    else:
        run_diario(today, dry_run=dry_run, test_mode=test_mode)
    log.info("=" * 60)
    log.info("Fim")


if __name__ == "__main__":
    main()
