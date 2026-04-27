# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Squad Dashboard

Dashboard de acompanhamento de vendas por squads para a Seazone (Pipeline SZI). Centraliza dados do Pipedrive, Meta Ads e Google Calendar em uma interface unificada.

- **Deploy:** Coolify self-hosted em `https://deploy.seazone.dev` — auto-deploy via push em `main` para `saleszone-prod` (`https://saleszone-prod.seazone.dev`). Staging: `saleszone-staging` (branch `staging`). Vercel (saleszone.vercel.app) está com auto-deploy desconectado desde abr/2026.
- **GitHub:** `seazone-tech/saleszone` (renomeado de `seazone-socios/saleszone` — origin antigo ainda funciona via redirect)
- **Supabase ATUAL:** `gams` (`gamswizeexihaymfweeq`) — único projeto pra staging+prod, contém todas as tabelas `squad_*`, `szs_*`, `mktp_*`, `decor_*`, edge functions e pg_cron. Auth OAuth Google, vault, 60+ cron jobs.
- **Supabase legado (NÃO usar):** `iob` (`iobxudcyihqfdwiggohz`) é só pra `losts` (Monitor de Atendimento jp-rambo, separado); `cnc` (`cncistmevwwghtaiyaao`) era prod antigo; `qsqa` era staging antigo.

## Stack
- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript 5
- **UI:** Tailwind 4, Lucide React, inline styles via `T` tokens (`lib/constants.ts`)
- **Validação:** Zod 4
- **Auth:** Supabase Auth (OAuth Google, domínio `@seazone.com.br`)
- **Database:** Supabase (PostgreSQL) + Edge Functions (Deno)

## Comandos
```bash
npm run dev              # Dev server (porta 3000)
npm run build            # Build produção
npm run lint             # ESLint
npm run lint -- --fix    # ESLint com auto-fix
```

## Arquitetura
```
Pipedrive API / Meta Ads API / Google Calendar API
    │
    ▼
Supabase Edge Functions (Deno) — triggered by pg_cron a cada 2h
    │
    ▼
Supabase PostgreSQL (tabelas squad_*)
    │
    ▼
Next.js API Routes (/api/dashboard/*) — leem do Supabase, agregam por squad
    │
    ▼
React Client Components — exibem tabs, charts, tabelas
    │
    ▼
Vercel (saleszone.vercel.app)
```

## Estrutura
```
src/
  app/
    page.tsx                 — Dashboard principal (client component, state global)
    login/, auth/, invite/   — Auth + onboarding
    admin/                   — Gestão de usuários (role diretor)
    api/                     — Routes server-side. Ver src/app/api/CLAUDE.md
    backlog/                 — Página backlog GitHub
  components/
    dashboard/               — Views principais. Ver src/components/dashboard/CLAUDE.md
    backlog/
  lib/
    constants.ts             — Squads, empreendimentos, closers, UI tokens (T)
    types.ts                 — Interfaces TypeScript
    supabase/                — Clients (browser/server/middleware)
  middleware.ts              — Protege rotas (redireciona /login se não autenticado)
supabase/
  functions/                 — Edge Functions Deno. Ver supabase/CLAUDE.md
scripts/                     — Automações (Fireflies, heartbeats Slack)
```

**Documentação por área:**
- API routes, cálculo de metas, filtros, lógica de forecast → `src/app/api/CLAUDE.md`
- Views, header, sync button, regras de cada tela → `src/components/dashboard/CLAUDE.md`
- Tabelas, Edge Functions, pg_cron, armadilhas Pipedrive/Meta/Supabase → `supabase/CLAUDE.md`

## Squads e Pessoas
| Squad | Marketing | Pré-Venda (SDR) | Closer | Empreendimentos |
|-------|-----------|-----------------|--------|-----------------|
| 1 | Jean | Carolina Maeda | Luana Schaikoski | Ponta das Canas Spot II, Marista 144 Spot, Jurerê Spot II, Jurerê Spot III, Vistas de Anitá II |
| 2 | Jean | Jeniffer Correa | Filipe Padoveze | Natal Spot, Novo Campeche Spot II, Caraguá Spot |
| 3 | Jean | Karoane Izabela Soares | Hellen Dias | Itacaré Spot, Bonito Spot II, Barra Grande Spot |

Total: 3 closers. Squads hardcoded em `src/lib/constants.ts`. Metas WON divididas por closer e distribuídas proporcionalmente por squad.

## Convenções
- Idioma do código: inglês
- Idioma da UI: português brasileiro
- Commits: conventional commits (`feat:`, `fix:`, `refactor:`)
- Estilos: inline styles com tokens de `T` (constants.ts), NÃO Tailwind nos components
- Dados sempre vêm do Supabase, NUNCA do Pipedrive direto no frontend
- Match de nomes (alinhamento) usa NFD normalize para ignorar acentos
- Git: branch principal `main`, fluxo `dev` → `staging` → `main`

## Env Vars (.env.local + Vercel)
- `NEXT_PUBLIC_SUPABASE_URL` — URL do Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-side only)
- `GITHUB_TOKEN` — Token GitHub com acesso ao repo `seazone-socios/saleszone`

## Vercel (legado)
- `maxDuration = 300` no sync route (sem isso, default é 10s e sync timeout)
- Deploy original: conta do Fernando (`fernandopereira-ship-it`). Auto-deploy GitHub→Vercel está **desconectado** desde abr/2026
- Prod ativo migrou pra Coolify (saleszone-prod). Vercel mantido só pra histórico

## Coolify (deploy ativo)
- Instância: `https://deploy.seazone.dev`
- Apps: `saleszone-prod` (branch `main`, domínio `saleszone-prod.seazone.dev`) e `saleszone-staging` (branch `staging`, domínio `saleszone-staging.seazone.dev`)
- Auto-deploy via webhook GitHub. Trigger manual via API: `POST /api/v1/deploy?uuid=<app_uuid>` com Bearer token
- Env vars apontam pra `gams` em prod e staging (sem isolamento de schema)

## Branch Protection / Workflow de PRs
- **Branch `main` protegida** (`enforce_admins: true` — bypass off, ninguém burla)
- **Aprovação obrigatória de CODEOWNER** (`@luizlopes-cloud`) antes de qualquer merge
- **Status check obrigatório:** `Alfred` (review IA automático)
- **Linear history:** ON (sem merge commits — squash apenas)
- **Force push e delete:** OFF
- **Stale reviews:** descartados ao receber novo push (precisa re-aprovar)
- **CODEOWNERS:** `.github/CODEOWNERS` aponta `* @luizlopes-cloud`
- **Permissões repo:** `luizlopes-cloud` = write (aprovar+mergear); `businessoperations-seazone` = admin
- **Workflow padrão:**
  1. Dev/agente abre PR contra `main`
  2. Alfred roda review automático (≤2min)
  3. Luiz revisa e aprova com `luizlopes-cloud` (manual via UI ou via `gh pr review --approve`)
  4. Squash merge + delete branch
  5. Coolify auto-deploya prod
- **Workflow Claude Code (assistente):**
  1. Claude abre PR
  2. Quando autorizado por "aprova", Claude troca pra `luizlopes-cloud`: `gh auth switch -u luizlopes-cloud`
  3. Approve + merge: `gh pr review <X> --approve` + `gh pr merge <X> --squash --delete-branch`
  4. Volta pro user padrão: `gh auth switch -u businessoperations-seazone`
- **Em emergência:** Luiz pode mergear direto via UI ou CLI sob qualquer um dos 2 users — `--admin` flag NÃO funciona (bypass off)

## Notificações de PR
- Recomendado: Slack via GitHub app — em canal dedicado (`#saleszone-prs` ou similar) digite `/github subscribe seazone-tech/saleszone pulls`

## Admin — Gestão de Usuários
- **Rota:** `/admin` (restrito a role `diretor`)
- **APIs:** `/api/admin/users`, `/api/admin/invite-links`, `/api/admin/analytics`
- **Convite por email:** diretor preenche email+nome+papel → cria `user_invitation` → email via Edge Function → usuário faz login Google → middleware auto-cria `user_profile`
- **Convite por link:** diretor gera link → compartilha URL `/invite?token=X` → usuário clica → cookie → OAuth Google → middleware valida token (ativo + não expirado + dentro do limite de usos), auto-cria `user_profile`, incrementa `used_count`
- **Middleware (`src/lib/supabase/middleware.ts`):** ordem de checagem: (1) profile ativo → OK, (2) inativo → bloqueia, (3) convite email → auto-provision, (4) invite link cookie → auto-provision, (5) nada → bloqueia
- **Rota `/invite` excluída do middleware** (matcher em `src/middleware.ts`) para carregar sem auth e setar cookie
- **Analytics:** heartbeat a cada 3min (`page.tsx` useEffect). Admin mostra acessos 7d/30d, sessão média, timeline recente

## Módulo SZS (Seazone Serviços)
- **Pipeline Pipedrive:** 14 (vs SZI = 28)
- **Hierarquia:** Canal Group > Cidade (vs SZI que é Squad > Empreendimento)
- **Canal Groups:** Marketing (12), Parceiros (582+583), Mônica (4551), Expansão (1748), Spots (3189), Outros (fallback)
- **Stages Pipeline 14:** Lead in (70), Contatados (71), Qualificação (72), Qualificado (345), Aguardando data (341), Agendado (73), No Show (342), Reunião Realizada (151), FUP (74), Negociação (75), Aguardando Dados (152), Contrato (76)
- **Stage mapping no funil:** "Reserva" = Aguardando Dados (152), "Contrato" = Contrato (76). Frontend mostra "Ag. Dados" em vez de "Reserva" quando `isSZS=true`
- **Conversão Ag. Dados/Contrato:** snapshot para exibição, acumulado para conversão. `reservaAcum = reserva + contrato + won`, `contratoAcum = contrato + won`
- **Metas WON:** hardcoded em `SZS_METAS_WON` por mês/canal na API route (não usa `nekt_meta26_metas`)
- **Edge Function:** `sync-szs-dashboard` — deploy com `--no-verify-jwt`
- **CUIDADO paginação:** `szs_daily_counts` pode ter >1000 rows na janela de 28 dias. Routes DEVEM paginar com queries separadas
- **CUIDADO szs_deals incompleto:** tabela tem ~11k deals mas Pipedrive tem ~60k+ (maioria lost). Modo `deals-lost` precisa de muitas rodadas. Impacta Perf. Vendas, Forecast e Leadtime (MQLs subestimados)
- **CUIDADO Pipedrive `/deals?status=lost&stage_id=X`:** ignora stage_id. Filtrar `pipeline_id===14` no código + dedup
- **MIA SZS:** `sq.empreendimentos` é `[]` (cidades dinâmicas). MIA deals filtrados por `preseller_name`, não por empreendimento
- **SZS não filtra canais:** diferente do SZI, SZS inclui TODOS os canais

## Heartbeats Slack — Automação
- **Skills:** `/resumo-heartbeat`, `/resumo-heartbeat-mkt`, `/resumo-heartbeat-comercial`, `/resumo-heartbeat-mktp`, `/resumo-heartbeat-cro`
- **App Slack:** "Heartbeats" (bot token em `SLACK_BOT_TOKEN`, bot user `U0AN8G720UA`). Gera notificações push
- **Automação launchd (3 jobs):**
  - `com.seazone.heartbeat-reminder` — Quinta 9h: @channel em 7 canais lembrando de enviar heartbeat
  - `com.seazone.heartbeat-followup` — Sexta 9h: menciona individualmente quem não postou
  - `com.seazone.weekly-heartbeat` — Sexta 18h: 5 resumos executivos enviados no DM do Ambrosi
- **Scripts:** `scripts/heartbeat_reminder.sh`, `scripts/heartbeat_followup.py`, `scripts/weekly_heartbeat.sh`
- **Plists:** `~/Library/LaunchAgents/com.seazone.heartbeat-*.plist`
- **CUIDADO:** launchd executa job atrasado ao ligar o Mac, mas precisa que o Mac esteja ligado para rodar no horário certo
