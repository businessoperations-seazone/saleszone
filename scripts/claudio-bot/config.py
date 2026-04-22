"""
Configuracao do bot Claudio — Alertas de deals sem atividade.

Edite este arquivo para ajustar tokens, pipelines, equipes e gestores.
O script principal (claudio.py) importa tudo daqui.
"""

import os
from pathlib import Path

# ── Carregar .env ────────────────────────────────────────────
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

# ─────────────────────────────────────────────────────────────
# TOKENS DE ACESSO (via env vars — nunca hardcode)
# ─────────────────────────────────────────────────────────────
PIPEDRIVE_API_TOKEN = os.environ.get("PIPEDRIVE_API_TOKEN", "")
PIPEDRIVE_DOMAIN = os.environ.get("PIPEDRIVE_DOMAIN", "seazone-fd92b9.pipedrive.com")
SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")

# ─────────────────────────────────────────────────────────────
# CANAL DE TESTE
# ─────────────────────────────────────────────────────────────
TEST_CHANNEL = "C0AJXPJKJ4E"  # #supervisor-claudio

# ─────────────────────────────────────────────────────────────
# PIPELINES DO PIPEDRIVE → CANAIS SLACK
# ─────────────────────────────────────────────────────────────
PIPELINES = {
    "SZS":   {"id": 14, "name": "Comercial SZS",         "channel": "C0AJXPJKJ4E"},
    "DECOR": {"id": 44, "name": "Comercial Decor",        "channel": "C0AJXPJKJ4E"},
    "SZI":   {"id": 28, "name": "Comercial SZI",          "channel": "C0AJXPJKJ4E"},
    "MKT":   {"id": 37, "name": "Comercial Marketplace",  "channel": "C0AJXPJKJ4E"},
}

# ─────────────────────────────────────────────────────────────
# OWNERS EXCLUIDOS (bots, sistema, inativos)
# ─────────────────────────────────────────────────────────────
# Espelho exato da lista di[] do dashboard Supervisor Claudio
# Esses owners sao SEMPRE excluidos, independente de PIPELINE_USERS
EXCLUDED_OWNERS = {
    "Morada - Mia",
    "BizOps",
    "Automacao",
    "Sapron",
    "cs@seazone.com.br",
    "Negócios",
    "Agendamentos",
    "RevOps",
    "financeiro-obras",
    "Lançamento Seazone",
    "Debora Brodt",
}

# ─────────────────────────────────────────────────────────────
# MAPEAMENTO: Owner Pipedrive → Slack ID + Cargo
# O nome DEVE ser identico ao campo owner_name no Pipedrive.
# role: "PV" = Pre-vendas, "Closer" = Vendas
# ─────────────────────────────────────────────────────────────
TEAM_MAP = {
    # === SZS - Pre-vendas ===
    "Adriano Dalagnelo":  {"slackId": "U09V1E035PH", "role": "PV"},
    "Carolina Maeda":     {"slackId": "U09HC6LNL1G", "role": "PV"},
    "Joyce":              {"slackId": "U07V5HPJTHU", "role": "PV"},
    "Joyce Batista":      {"slackId": "U07V5HPJTHU", "role": "PV"},
    "Raquel":             {"slackId": "U088F01TNJC", "role": "PV"},
    "Raquel Lacerda":     {"slackId": "U088F01TNJC", "role": "PV"},
    "Raynara Lopes":      {"slackId": "U08CQKF05MK", "role": "PV"},
    "Larissa Marques":    {"slackId": "U09P0U3EWTZ", "role": "PV"},
    # === SZS - Closers (Vendas) ===
    "Gabriela Branco":    {"slackId": "U07SZLKAPLN", "role": "Closer"},
    "Gabriela Lemos":     {"slackId": "U09BQ3P7894", "role": "Closer"},
    "Giovanna Kauling":   {"slackId": "U08F83J7GFL", "role": "Closer"},
    "Maria Vitória":      {"slackId": "U09SDHM1546", "role": "Closer"},
    "Maria Vitória Amaral": {"slackId": "U09SDHM1546", "role": "Closer"},
    "Samuel Ribeiro":     {"slackId": "U09CY0NKRPH", "role": "Closer"},
    "Samuel Barreto":     {"slackId": "U09CY0NKRPH", "role": "Closer"},
    # === Decor - Pre-vendas ===
    "Rubia Lorena":       {"slackId": "U09A78NL97C", "role": "PV"},
    "Rubia Lorena Santos": {"slackId": "U09A78NL97C", "role": "PV"},
    # === Decor - Closers ===
    "Carol Rosário":      {"slackId": "U09CY0GA42K", "role": "Closer"},
    "Eduardo Albani":     {"slackId": "U07R2U4849M", "role": "Closer"},
    # === SZI - Pre-vendas ===
    "Hellen Dias":        {"slackId": "U099JT77FBL", "role": "PV"},
    "Jeniffer Correa":    {"slackId": "U07V3CS5HFV", "role": "PV"},
    "Natália Saramago":   {"slackId": "U09C258C18Q", "role": "PV"},
    "Luciana Patricio":   {"slackId": "U09C257AN2U", "role": "PV"},
    # === SZI - Closers ===
    "Camila Santos":      {"slackId": "U0952S3FHKL", "role": "Closer"},
    "Luana Lima":         {"slackId": "U04TUNM6NQ0", "role": "Closer"},
    "Luana Schaikoski":   {"slackId": "U04TUNM6NQ0", "role": "Closer"},
    "Priscila Perrone":          {"slackId": "U08D65F6PUZ", "role": "Closer"},
    "Priscila Pestana Perrone":  {"slackId": "U08D65F6PUZ", "role": "Closer"},
    # === Marketplace - Pre-vendas ===
    "Karoane":                    {"slackId": "U09PK1H2UEB", "role": "PV"},
    "Karoane Izabela Soares":     {"slackId": "U09PK1H2UEB", "role": "PV"},
    "Karoline Borges":            {"slackId": "U09K0AJ1623", "role": "PV"},
    # === Marketplace - Closers ===
    "Nevine":             {"slackId": "U08BQMTJ8MR", "role": "Closer"},
    "Willian Miranda":    {"slackId": "U058FUDQXCL", "role": "Closer"},
    # === Cross-pipeline (configurados no dashboard, antes excluidos) ===
    "Kamille Gomes":                  {"slackId": "U081JARBRGX", "role": "PV"},
    "Filipe Padoveze":                {"slackId": "U093E1FDJJZ", "role": "Closer"},
    "Laura":                          {"slackId": "U09FMREE3JR", "role": "Closer"},
    "Giovanna de Araujo Zanchetta":   {"slackId": "U08F83J7GFL", "role": "Closer"},
    "Pamella Brayner":                {"slackId": "U01DC6N6H2N", "role": "Closer"},
    # === Owners extras (aparecem em pipelines, nao configurados no dashboard) ===
    "Silas Rocha de Miranda":         {"slackId": "U0A51KEPX7S", "role": "Closer"},
    "Crislaine Oliveira":             {"slackId": "U08TW5U01L4", "role": "Closer"},
    "Abner Weber Gomes":              {"slackId": "U06GG6YF09H", "role": "Closer"},
    "Roberto Amaral":                 {"slackId": "U0AG3C6JU77", "role": "Closer"},
    "Cynthia Ferreira":               {"slackId": "U044ZGPLQ5D", "role": "Closer"},
    "Mayara Marques":                 {"slackId": "U0ADF45MW2Z", "role": "Closer"},
    "Mayara":                         {"slackId": "U0ADF45MW2Z", "role": "Closer"},
}

# ─────────────────────────────────────────────────────────────
# GESTORES POR PIPELINE (quem recebe @mention na msg principal)
# pv = gestor de pre-vendas, vendas = gestor de vendas
# cc = mencao extra (opcional, so SZS tem)
# ─────────────────────────────────────────────────────────────
MANAGERS = {
    "SZS":   {"pv": "U081JARBRGX", "vendas": "U0ADF45MW2Z", "cc": "U05HFS5NFL1"},
    "DECOR": {"pv": "U0A5TKF4Q1M", "vendas": "U0A5TKF4Q1M"},
    "SZI":   {"pv": "U07V3CS5HFV", "vendas": "U01DC6N6H2N"},
    "MKT":   {"pv": "U0AG3C6JU77", "vendas": "U0AG3C6JU77"},
}

# ─────────────────────────────────────────────────────────────
# USUARIOS PERMITIDOS POR PIPELINE (espelho do dashboard Supervisor Claudio)
# Somente owners listados aqui sao contabilizados no pipeline correspondente.
# Nomes devem ser identicos ao campo owner_name no Pipedrive.
# ─────────────────────────────────────────────────────────────
PIPELINE_USERS = {
    "SZS": {
        "Adriano Dalagnelo",
        "Carolina Maeda",
        "Gabriela Branco",
        "Gabriela Lemos",
        "Giovanna de Araujo Zanchetta",
        "Joyce",
        "Joyce Batista",
        "Kamille Gomes",
        "Larissa Marques",
        "Maria Vitória Amaral",
        "Maria Vitória",
        "Raquel",
        "Raquel Lacerda",
        "Raynara Lopes",
        "Samuel Barreto",
        "Samuel Ribeiro",
    },
    "DECOR": {
        "Carol Rosário",
        "Eduardo Albani",
        "Rubia Lorena Santos",
        "Rubia Lorena",
    },
    "SZI": {
        "Camila Santos",
        "Filipe Padoveze",
        "Hellen Dias",
        "Jeniffer Correa",
        "Laura",
        "Luana Schaikoski",
        "Luana Lima",
        "Luciana Patricio",
        "Natália Saramago",
        "Priscila Pestana Perrone",
        "Priscila Perrone",
        "Pamella Brayner",
    },
    "MKT": {
        "Karoane Izabela Soares",
        "Karoane",
        "Karoline Borges",
        "Nevine",
        "Willian Miranda",
    },
}

# ─────────────────────────────────────────────────────────────
# CONSTANTES
# ─────────────────────────────────────────────────────────────
MAX_DEALS_PER_PART = 50       # Deals por parte quando mensagem e muito longa
MAX_MESSAGE_CHARS = 3500      # Limite para split de mensagem
SLACK_DELAY_SECONDS = 1       # Delay entre mensagens (rate limit)
PIPEDRIVE_RETRY_COUNT = 3     # Tentativas em caso de falha
PIPEDRIVE_BASE_BACKOFF = 2    # Segundos (exponencial: 2, 4, 8)
PIPEDRIVE_PAGE_LIMIT = 500    # Deals por pagina na API
