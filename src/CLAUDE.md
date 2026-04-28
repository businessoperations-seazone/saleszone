# src/CLAUDE.md — Views, API Routes, Filtros e UI

## Estrutura
```
app/
  page.tsx                    — Dashboard principal (client component, state global)
  login/page.tsx              — Login
  auth/callback/route.ts      — OAuth callback Supabase
  api/dashboard/              — Todas as API routes (ver tabela abaixo)
  api/sync/route.ts           — Orquestrador sync (chama Edge Functions)
components/dashboard/
  header.tsx                  — Navegacao + botao Atualizar
  ui.tsx                      — Componentes reutilizaveis (MediaFilterToggle, Pill, TH, etc)
  *-view.tsx                  — Uma view por aba
lib/
  constants.ts                — Squads, empreendimentos, closers, UI tokens (T)
  types.ts                    — Todas as interfaces TypeScript
  dates.ts                    — Gerador de datas 28 dias
  supabase.ts                 — Cliente browser
  supabase/server.ts          — createServerClient (cookies)
  supabase/middleware.ts       — Valida sessao + dominio
middleware.ts                 — Protege rotas (redireciona /login)
```

## View Resultados (Funil Comercial)
- **Funil:** Leads > MQL > SQL > OPP > Reserva > Contrato > WON + Investimento
- **Leads** = leads Meta Ads (`leads_month`) + MQLs de outros canais (`max(MQL - leads_meta, 0)`)
- **MQL/SQL/OPP/WON** = `squad_daily_counts` filtrado pelo mes (open + won + lost)
- **Reserva/Contrato (cards)** = snapshots de deals nos stages 191/192 (sem filtro de data)
- **Reserva/Contrato (conversoes)** = coorte de deals fechados no mes via `squad_deals`. Conta por `max_stage_order`: OPP (>=9), Reserva (>=13), Contrato (>=14), WON (status=won). Exclui `lost_reason = 'Duplicado/Erro'` em JS
- **IMPORTANTE:** Cards e conversoes usam fontes DIFERENTES. Card = `squad_daily_counts`. Conversao = `squad_deals` (coorte). NAO misturar
- **Custos:** CMQL (spend/MQL), COPP (spend/OPP), CPW (spend/WON)

## Filtro "Todos / Midia Paga"
Toggle em Campanhas e Diagnostico Mkt. Default: **"Midia Paga"**. Componente `MediaFilterToggle` em `ui.tsx`.

**Logica Paid:** MQL = `min(MQL total, leads Meta Ads)` por emp. SQL/OPP/WON escalados pelo ratio `MQL_paid / MQL_total`.
**Logica All:** Leads = Meta Ads + MQLs nao-pagos. MQL/SQL/OPP/WON = totais Pipedrive.
**APIs com `?filter=paid`:** `/api/dashboard`, `/api/dashboard/funil`, `/api/dashboard/campanhas`
Orcamento/Planejamento NAO tem toggle. Resultados/Acompanhamento buscam com `"all"`.

## Planejamento
- Filtro periodo: 30d/60d/90d/6m/12m (default)/Todo. Param `?days=N` (0=12m, >0=N dias, -1=tudo)
- **Summary Cards:** mostram **total combinado** (`current + historical`), NAO so mes atual
- **Historico de Campanhas:** RPC `get_historico_campanhas` (~1776 rows, DEVE paginar com `.range()`)
- Funil por ad = distribuicao proporcional pelo spend share (nao existe link direto ad→deal)
- **Status ativo/pausado:** determinado pelo snapshot mais recente global, NAO pelo `effective_status` da RPC
- Drill-down: Campanha → Adset → Ad

## Orcamento
- Orcamento global SZI, input direto na tela, salva em `squad_orcamento`
- **Gasto diario** = `gasto_ativas / dias_passados` (media real, NAO daily_budget Meta API)
- **gastoDiario = 0** quando emp tem 0 campanhas ativas
- **Projecao:** diasPassados >= 3 → media; senao → gastoDiario × diasNoMes
- **Budget Recom.** = valores FIXOS de `squad_orcamento_approved`. NAO e dinamico. Muda so via `/gestao-orcamento`
- Skill `/gestao-orcamento`: propoe distribuicao → usuario aprova → grava → commit + push

## Forecast
- **SZI:** `/api/dashboard/forecast` — por squad/closer. Dados: `squad_deals` (is_marketing=true)
- **SZS:** `/api/szs/forecast` — por canal. Dados: `szs_deals`
- **Logica:** Ja Ganhos (WON no mes) + Pipeline (abertos × taxa conversao 90d por etapa)
- Taxa conversao = deals que passaram pela etapa X (add_time >= 90d), % virou WON. Exclui `lost_reason = 'Duplicado/Erro'` em JS (nao Supabase — bug `.neq` com NULLs)
- Leadtime = media (nao mediana) da etapa ate WON. Usa `won_time >= 90d` (query separada de conversao!)
- Ranges: pessimista (×0.7), esperado (×1.0), otimista (×1.3)
- **Metas:** SEMPRE `nekt_meta26_metas` (total mes). NUNCA `squad_metas` (proporcional ao dia)
- **CUIDADO datas UTC:** `new Date("2026-03-01")` em BRT vira 28/fev 21h. Usar `T12:00:00`

## Leadtime
- `/api/dashboard/leadtime?days=N` (default 90). Filtro por `won_time`
- Ciclo global: `(won_time - add_time)` com avg/median/P90
- Por etapa: distribuicao proporcional ponderada (stages altos recebem mais tempo)
- Toggle Todos/Abertos recalcula no frontend com `computeStats()`
- Color coding: verde <80% media, vermelho >120%. Dias: verde <30d, amarelo 30-89d, vermelho >=90d

## Diagnostico Vendas
- Deals abertos de `squad_deals`, filtrados pelos closers em V_COLS
- Leadtime = horas desde `last_activity_date` (ou `add_time`). Precisao ~1 dia
- Thresholds: CRITICO >= 24h, ALERTA >= 12h, OK < 12h
- Deal links: `https://seazone-fd92b9.pipedrive.com/deal/{id}`

## Base-Line (Cohort)
- Busca TODOS os deals (sem cutoff), agrupa por monthOffset desde contratacao
- **Datas contratacao** hardcoded em `CLOSER_HIRE_DATES` na API route
- Toggle: Conversao % (OPP→WON) / Volume OPP (acum) / Volume WON (acum)
- Grafico SVG com mediana tracejada amarela (#f59e0b)

## Performance Vendas (Graficos OPP→WON)
- `OppToWonChart` aceita `maxMonths` para filtrar pontos
- Mediana tracejada amarela. Periodo responsivo ao filtro selecionado
- `maxMonths=0` = sem filtro

## Performance Pre-Vendas — Armadilhas
- **Campo Pre Vendedor(a)** (field key `34a7f4f5f78...`) ≠ `owner_name`. Salvo em `squad_deals.preseller_name`
- Filtro periodo: usa `won_time`/`lost_time` (fechamento), NAO `add_time`
- Normalizacao de nomes: usar `norm()` (NFD + remove diacritics)
- Atividades por tipo: Ligacoes (call, chamada_*), Mensagens (mensagem, email, whatsapp_*, szi___*), Reunioes (reuniao, meeting, no_show)

## Avaliacoes de Reunioes
- `/api/dashboard/avaliacoes?days=N` — calendar events com Fireflies transcricoes
- 5 Pilares (20% cada): Conhecimento Produto, Tecnicas Venda, Rapport, Foco CTA, Objetividade
- Transcricoes corrompidas (nota 0) = invalidas, excluidas da media
- Filtro: 7d/14d/30d/60d/90d
- **CUIDADO ASR idioma errado:** Fireflies transcreve PT como EN → gibberish
