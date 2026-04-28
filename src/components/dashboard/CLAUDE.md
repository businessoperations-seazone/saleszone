# Components — Dashboard Views

Componentes React de cada view do dashboard. Para regras de API e dados: ver `../../app/api/CLAUDE.md`.

## Convenções
- Idioma da UI: português brasileiro
- Estilos: **inline styles** com tokens de `T` (em `lib/constants.ts`), NÃO Tailwind nos components
- Dados sempre via API routes (`/api/dashboard/*`), nunca direto do Supabase no client
- `MediaFilterToggle` reutilizável em `ui.tsx`. Type `MediaFilter` em `types.ts`

## Views

| View | Componente | API Route | Descrição |
|------|-----------|-----------|-----------|
| Campanhas (default) | `campanhas-view.tsx` | `/api/dashboard/campanhas` | Meta Ads SZI: summary, por squad, Top 10 |
| Diagnóstico Mkt | `diagnostico-mkt-view.tsx` | (usa campanhas) | Badges squad, resumo empreendimento, ads |
| Alinhamento Squad | `alinhamento-view.tsx` | `/api/dashboard/alinhamento` | Deals abertos × owner × empreendimento |
| Acompanhamento | `acompanhamento-view.tsx` | `/api/dashboard?tab=X` | Contagens diárias MQL/SQL/OPP/WON |
| Pré-Venda | `presales-view.tsx` | `/api/dashboard/presales` | Tempo resposta pré-vendedores |
| Ociosidade | `ociosidade-view.tsx` | `/api/dashboard/ociosidade` | Ocupação closers via Calendar |
| Balanceamento | `balanceamento-view.tsx` | `/api/dashboard/regras-mql` | Regras MQL por empreendimento/fonte |
| Resultados (Funil) | `resultados-view.tsx` | `/api/dashboard/funil` | Funil comercial Leads→WON |
| Planejamento | `planejamento-view.tsx` | `/api/dashboard/planejamento` | Métricas atuais vs históricas + drill-down campanha→adset→ad |
| Orçamento | `orcamento-view.tsx` | `/api/dashboard/orcamento` | Budget mensal editável, projeção |
| Performance Vendas | `performance-view.tsx` | `/api/dashboard/performance` | Closers + empreendimentos + pré-vendas |
| Base-Line | `baseline-view.tsx` | `/api/dashboard/performance/baseline` | Cohort analysis closers alinhados pela contratação |
| Diagnóstico Vendas | `diagnostico-vendas-view.tsx` | `/api/dashboard/diagnostico-vendas` | Leadtime follow-up, deals sem atividade |
| Forecast | `forecast-view.tsx` | `/api/dashboard/forecast` | Previsão de vendas do mês |
| Leadtime | `leadtime-view.tsx` | `/api/dashboard/leadtime` | Tempo médio por etapa do funil |
| Avaliação Reuniões | `avaliacoes-view.tsx` | `/api/dashboard/avaliacoes` | Notas por closer (5 pilares) Fireflies + Claude |
| Conversões | `conversoes-view.tsx` | `/api/dashboard/ratios` | Histórico de ratios + gráfico SVG (sub-aba de Acompanhamento) |

## Navegação Header

Ordem dos botões: `Resultados ▼ | Meta Ads ▼ | Alinhamento Squad | Pré-Venda ▼ | Vendas ▼`

- **Resultados** dropdown agrupa: Funil, Acompanhamento, Forecast
- **Meta Ads** dropdown agrupa: Campanhas, Diagnóstico Mkt, Orçamento, Planejamento
- **Vendas** dropdown agrupa: Perf. Vendas, Base-Line, Diagnóstico Vendas, Ociosidade, Leadtime, Avaliação Reuniões
- Dropdowns usam `useState` + `useRef` + `useEffect` (click outside listener) em `header.tsx`
- Constantes `META_ADS_VIEWS` e `VENDAS_VIEWS` definem os view keys agrupados
- Botão fica ativo (dark bg) quando `mainView` é qualquer um dos valores do grupo

## Botão "Atualizar" (Sync)

Sincroniza TODAS as abas de uma vez. Usa modos **light** para evitar timeout/WORKER_LIMIT:
- `dashboard-light`: pula `daily-lost` (58k+ deals, estoura 150MB)
- `deals-light`: pula `deals-lost` e `deals-flow` (timeout 504)
- As funções pesadas rodam no **pg_cron a cada 2h**

**Concurrency Pool (max 4 workers, slowest-first):**
- Steps API ordenados por duração estimada (presales=0 mais lento, baserow=8 mais rápido)
- Pool de 4 workers processa steps em FIFO — max 4 EFs concorrentes a qualquer momento
- Steps DB-only (metas, monthly-rollup) rodam após pool terminar
- **Sem timeout artificial** — Vercel (300s) e Supabase (150s) são os limites naturais
- Retry somente em HTTP 504 (delay 3s)
- Tempo total ≈ **~35-40s** (limitado pela função mais lenta: presales ~35s)

**Timer:** botão mostra segundos decorridos: `"Atualizando... (12s)"`

**Persistência localStorage:** `lastUpdated` (timestamp) e `mainView` (aba ativa) são salvos no `localStorage`. Componente `DataSourceFooter` em `ui.tsx` renderiza `"Pipedrive · DD/MM/YYYY HH:MM"` no rodapé de cada view.

**Após sync:** limpa TODOS os caches do frontend. A aba atual re-busca dados imediatamente; outras abas buscam dados frescos ao serem acessadas.

**CUIDADO — Rate limit:**
- Pipedrive 429: não rodar sync manual próximo ao horário do pg_cron (minutos :03 a :11 a cada 2h)
- Meta API 403: pode dar próximo ao pg_cron ou após múltiplas tentativas. Rate limit reseta em ~15 min

### Sync functions (botão Atualizar — modo light)
Envia: `["dashboard-light", "meta-ads", "deals-light", "calendar", "presales", "baserow"]`

| Function | Steps | O que pula vs full |
|----------|-------|-------------------|
| `dashboard-light` | daily-open, daily-won, alignment, metas, monthly-rollup | Pula `daily-lost` |
| `deals-light` | deals-open, deals-won | Pula `deals-lost` e `deals-flow` |
| Demais | Igual ao full | — |

### Sync functions por tab (referência — para pg_cron)
| View | Functions |
|------|-----------|
| Acompanhamento / Alinhamento | `["dashboard"]` |
| Campanhas / Diagnóstico Mkt / Orçamento | `["meta-ads"]` |
| Ociosidade | `["calendar"]` |
| Pré-Venda | `["presales"]` |
| Resultados | `["dashboard", "meta-ads", "deals"]` |
| Balanceamento | `["baserow", "meta-ads"]` |
| Planejamento | `["deals", "meta-ads"]` |
| Diagnóstico Vendas / Forecast / Leadtime | `["deals"]` |

## Planejamento — Filtro de Período

- Select no topo com opções: 30d, 60d, 90d, 6 meses, 12 meses (default), Todo histórico
- Param `?days=N` (`0` = 12 meses, `>0` = N dias, `-1` = sem filtro de data)
- Meta Ads histórico também respeita o filtro
- Ao trocar filtro, limpa `planejData` e re-busca

### Métricas de Conversão (Summary Cards)
- **IMPORTANTE:** API retorna `current` (mês atual) e `historical` (meses anteriores). Os cards devem mostrar o **total combinado** (`current + historical`) como valor principal, não só o mês atual
- Cards: Investimento Total, WON Total, CPW Médio, MQL→SQL, SQL→OPP, OPP→WON
- Linha de comparação = "Mês atual" (só o mês corrente, para referência)
- **Armadilha:** se usar só `tc` (current = mês atual) como valor principal, os números ficam artificialmente baixos (ex: 1 WON no mês vs 168 no período). Sempre combinar `current + historical`

### Histórico de Campanhas (drill-down)
- Seção sempre aberta na aba Planejamento, fetch automático
- Busca via RPC `get_historico_campanhas` — agrega snapshots de `squad_meta_ads` por ad_id (MAX spend/leads/impressions/clicks lifetime). RPC retorna ~1776 rows, **DEVE ser paginada** com `.range()` (limite 1000 por request)
- Funil (MQL/SQL/OPP/WON) via `get_planejamento_counts(-1, -1)` por empreendimento, distribuído proporcionalmente pelo spend share de cada ad
- **Status ativo/pausado:** determinado pelo snapshot mais recente. NÃO usar o `effective_status` retornado pela RPC (que pega o último snapshot POR AD, podendo ser de meses atrás)
- **Drill-down 3 níveis:** Campanha → Conjunto de Anúncio → Criativo
- Filtros: empreendimento, status, colunas (Conversões / Custos / Mídia), "Somente com WON"

## Orçamento

- Orçamento global SZI (um valor mensal para todos os squads)
- Input direto na tela: clicar no card "Orçamento Mensal" para editar
- Salva em `squad_orcamento` (upsert por `mes`)
- **Gasto diário:** calculado como `gasto_campanhas_ativas / dias_passados` (média real, NÃO `daily_budget` do Meta API)
- `gastoDiario = 0` quando empreendimento tem 0 campanhas ativas
- **Projeção:** se `diasPassados >= 3`, usa `(gastoAtual / diasPassados) * diasNoMes`; senão usa `gastoDiario * diasNoMes`
- **Status:** ok (projeção <= 105% orçamento), alerta (<= 115%), crítico (> 115%)
- NÃO usa `daily_budget` da Meta API (valores inconsistentes)
- **Coluna Budget Recom.:** budget diário aprovado por empreendimento. Valores **FIXOS** lidos de `squad_orcamento_approved`. NÃO recalcula dinamicamente — só muda com aprovação via `/gestao-orcamento`
- **CUIDADO budget NÃO é dinâmico:** cálculo antigo de CPW/funnel que recalculava a cada request foi REMOVIDO. Motivo: valores que mudam sozinhos confundem o acompanhamento
- **Barra de projeção azul:** mostra projeção de gasto com budget recomendado (overlay)
- **Log de Alterações:** registra quando gasto diário real = budget recomendado (match exato) em `squad_orcamento_log`
- **Skill `/gestao-orcamento`:** análise completa de distribuição. Propõe nova distribuição, usuário aprova, grava em `squad_orcamento_approved`. Após gravar, SEMPRE publicar (commit + push)

## Diagnóstico Vendas (Leadtime de Follow-up)

- **Leadtime:** horas desde `last_activity_date` (ou `add_time` se null) até agora. `last_activity_date` é DATE (sem hora), precisão ~1 dia
- **Thresholds severidade:** CRÍTICO >= 24h, ALERTA >= 12h, OK < 12h
- **Severidade do closer:** baseada na média do leadtime dos seus deals
- **Atividade futura:** `next_activity_date`. Deal "sem atividade futura" = campo null. Deal "atividade atrasada" = `next_activity_date < hoje`
- **Filtros deals:** Squad, Closer, Severidade, Etapa, Atividade
- **Deal links:** título clicável abre no Pipedrive (`https://seazone-fd92b9.pipedrive.com/deal/{id}`)
- **CUIDADO owner_name:** `/pipelines/{id}/deals` retorna `user_id` como integer. `syncDealsOpen` busca `/users` primeiro e mapeia. Sem isso, `owner_name` fica null

## Leadtime (por Etapa do Funil)

- **Lógica:**
  1. **Ciclo global:** `cycleDays = (won_time - add_time)` para cada deal ganho no período. Calcula avg/median/P90
  2. **Leadtime por etapa:** estimativa proporcional ponderada — stages mais altos recebem mais tempo. Peso de cada stage = `stage_order / sum(1..max_stage_order)`. Ex: deal com max_stage_order=9, peso stage 1 = 1/45, peso stage 9 = 9/45
  3. **Deals abertos por etapa:** agrupados por `stage_order`. Encontra o deal mais antigo (menor `add_time`) em cada stage com link Pipedrive
  4. **By closer:** lista completa de deals (won + open) por closer com `cycleDays` (won: won_time - add_time; open: now - add_time). Só inclui closers de V_COLS
- **Param:** `?days=N` (default 90) — período para deals ganhos. Deals abertos sempre incluídos
- **Toggle Todos/Abertos:** recalcula média/mediana/contagem no frontend com `computeStats()` sobre os deals filtrados
- **Color coding:** verde (abaixo de 80% da média filtrada), vermelho (acima de 120%). Para dias individuais: verde <30d, amarelo 30-89d, vermelho >=90d
- **CUIDADO:** distribuição proporcional ponderada (NÃO uniforme). Stages mais altos (negociação, reservas) tendem a ter mais tempo

## Base-Line (Cohort Analysis)

- **Data de contratação** hardcoded em `CLOSER_HIRE_DATES` na API route. Valores atuais: Luana=2024-03, Filipe=auto (primeiro deal), Hellen=auto. Para alterar, editar o mapa
- **monthZero** = data de contratação. Todos os offsets (M0, M1, ...) partem dessa data
- **Toggle 3 modos:** Conversão % (OPP→WON por mês), Volume OPP (acumulado), Volume WON (acumulado)
- **Tabela cohort:** heatmap com color coding. Coluna "vs Mediana" compara total do closer contra mediana do grupo
- **Gráfico SVG:** linhas por closer (cor do squad), linha tracejada amarela (#f59e0b) = mediana
- Cada closer tem comprimento de linha diferente (quem entrou depois tem menos meses)

## Gráficos OPP→WON

- Componente `OppToWonChart` em `performance-view.tsx` aceita prop `maxMonths` para filtrar pontos
- **Mediana:** linha tracejada amarela (#f59e0b) com label "Mediana X%". Aparece quando há 2+ séries (não no consolidado)
- **Período responsivo:** gráficos respeitam o filtro de período selecionado (30d→1m, 60d→2m, 90d→3m, 180d→6m, 12m→12m, Tudo→sem corte)
- `maxMonths=0` ou undefined = sem filtro

## Avaliação de Reuniões (Fireflies + Claude)

- **Dados:** tabela `squad_calendar_events` (colunas `fireflies_id`, `transcricao`, `avaliacao` JSONB, `diagnostico`)
- **5 Pilares** (20% cada): Conhecimento do Produto, Técnicas de Venda, Rapport e Empatia, Foco no CTA, Objetividade
- **Seções:**
  1. Nota Média por Closer (header com 5 pilares + nota média). Expansível por reunião com justificativas, destaques e melhorias
  2. Reuniões × Transcrições — tabela por closer: total, válidas, inválidas (expansível com motivo)
- **Exclusões:** reuniões canceladas, transcrições corrompidas (nota 0 = ASR falhou)
- **Filtro:** 7d / 14d / 30d / 60d / 90d
- **Tipos de invalidez:** sem gravação, transcrição curta (<500 chars), corrompida, alucinação detectada
- **CUIDADO ASR em idioma errado:** Fireflies às vezes transcreve PT como EN → gibberish
