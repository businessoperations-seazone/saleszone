# API Routes — Squad Dashboard

API routes Next.js que leem do Supabase, aplicam filtros e retornam JSON pros components.
Para regras de tabelas, Edge Functions e armadilhas Pipedrive/Meta/Supabase: ver `../../../supabase/CLAUDE.md`.

## Convenções

- Idioma do código: inglês
- Dados sempre vêm do Supabase, **NUNCA** do Pipedrive direto no frontend
- Match de nomes (alinhamento) usa `NFD normalize` para ignorar acentos — Pipedrive pode ter "Patricio" sem acento vs constants com "Patrício"
- Para tabelas com >1000 rows, paginar com `.range(offset, offset+999)` em loop
- Usar `SUPABASE_SERVICE_ROLE_KEY` em routes server-side que precisam contornar RLS

## Cálculo de Metas

1. Ler `nekt_meta26_metas` do mês atual (campo `data` formato DD/MM/YYYY, ex: "01/03/2026")
2. `meta_won_total = won_szi_meta_pago + won_szi_meta_direto`
3. `meta_won_squad = (meta_won_total / V_COLS.length) * closers_do_squad`
4. `meta_to_date = (dia_atual / dias_no_mes) * meta_won_squad`
5. Metas MQL/SQL/OPP = ratios 90d (de `squad_ratios`) × meta WON do squad

- **NUNCA** usar `deal.value` (R$ monetário) como meta — sempre ler de `nekt_meta26_metas`
- Dividir por closers (não por squads) e distribuir proporcionalmente
- **`squad_metas` vs `nekt_meta26_metas`:** `squad_metas` armazena meta PROPORCIONAL ao dia (meta_to_date). `nekt_meta26_metas` armazena meta TOTAL do mês. Para forecast (previsão fim do mês), usar `nekt_meta26_metas`. Para acompanhamento diário, usar `squad_metas`

## Filtro "Todos / Mídia Paga"

Toggle dentro de cada view Meta Ads (Campanhas, Diagnóstico Mkt). Default: **"Mídia Paga"**.
Componente reutilizável `MediaFilterToggle` em `ui.tsx`. Type `MediaFilter` em `types.ts`.

**Onde aparece:**
- Campanhas — toggle no topo, ao lado dos summary cards
- Diagnóstico Mkt — toggle no topo, ao lado dos summary cards
- Orçamento / Planejamento — SEM toggle (API não suporta filtro)
- Resultados / Acompanhamento — sempre buscam com `"all"` (sem toggle)

**Lógica Paid (mesma em todas as abas):**
- MQL = `min(MQL total, leads Meta Ads)` por empreendimento
- SQL/OPP/WON = escalados proporcionalmente pelo ratio `MQL_paid / MQL_total`
- Leads = leads Meta Ads somente (sem MQLs de outros canais)

**Lógica All:**
- Leads = leads Meta Ads + MQLs não-pagos
- MQL/SQL/OPP/WON = totais do Pipedrive (todas as fontes)

**APIs que aceitam `?filter=paid`:**
- `/api/dashboard` (acompanhamento) — escala daily counts proporcionalmente
- `/api/dashboard/funil` (resultados)
- `/api/dashboard/campanhas` (campanhas + diagnóstico mkt)

## Routes principais

| Route | Descrição |
|-------|-----------|
| `/api/sync` | Orquestrador: chama Edge Functions sequencialmente. `maxDuration = 300` (sem isso default 10s e timeout) |
| `/api/dashboard` | Daily counts por tab. Aceita `?filter=paid` |
| `/api/dashboard/acompanhamento` | Heatmap diário por empreendimento |
| `/api/dashboard/alinhamento` | Distribuição deals por owner/squad |
| `/api/dashboard/alinhamento/deals` | Deals desalinhados por pessoa (com links Pipedrive) |
| `/api/dashboard/campanhas` | Meta Ads por squad/empreendimento |
| `/api/dashboard/funil` | Funil Leads→MQL→SQL→OPP→Reserva→Contrato→WON |
| `/api/dashboard/ociosidade` | Disponibilidade closers (Google Calendar) |
| `/api/dashboard/presales` | Tempo de resposta pré-vendedores |
| `/api/dashboard/regras-mql` | Regras e taxas de qualificação MQL |
| `/api/dashboard/planejamento` | Conversão mídia paga vs histórico (`?days=N`) |
| `/api/dashboard/planejamento/historico` | Histórico TODAS campanhas Meta Ads |
| `/api/dashboard/orcamento` | GET/POST orçamento mensal + gasto diário |
| `/api/dashboard/performance` | Funil por pessoa (closer, preseller, marketing) + time series |
| `/api/dashboard/performance/baseline` | Cohort analysis: closers alinhados pelo mês de contratação |
| `/api/dashboard/diagnostico-vendas` | Leadtime de follow-up por closer |
| `/api/dashboard/forecast` | Forecast: previsão de vendas do mês |
| `/api/dashboard/leadtime` | Leadtime: tempo médio por etapa do funil (`?days=N`) |
| `/api/dashboard/ratios` | Histórico de ratios de conversão (`?days=N`) |
| `/api/dashboard/avaliacoes` | Avaliação de Reuniões via Fireflies + Claude |
| `/api/backlog/contributions` | Contribuições GitHub do repo |

## Performance Pré-Vendas — Armadilhas

- **Campo Pré Vendedor(a)** do Pipedrive (field key `34a7f4f5f78e8a8d4751ddfb3cfcfb224d8ff908`, tipo user) — diferente de `owner_name`. Salvo em `squad_deals.preseller_name`
- **Filtro de período:** Pipedrive "Negócio fechado em" usa `won_time`/`lost_time`. Um deal antigo fechado recentemente aparece no Pipedrive mas não aparecia no dashboard. Corrigido: API usa `status=open OR won_time>=cutoff OR lost_time>=cutoff OR add_time>=cutoff`
- **Normalização de nomes:** `preseller_name` no banco pode vir sem acento. Usar `norm()` (NFD + remove diacritics) ao comparar
- **Atividades por tipo:** busca direto da API Pipedrive `/activities?user_id=X&done=1&start_date=Y&end_date=Z`. Categorias:
  - Ligações: `call`, `chamada_atendida_api4com`, `chamada_nao_atendida_api4c`
  - Mensagens: `mensagem`, `email`, `whatsapp_chat`, `szi___*`, `mensagem_respondida`, `mensagem_nao_respondida`
  - Reuniões: `reuniao`, `meeting`, `no_show`, `reuniao_apresentacao_contr`, `reuniao_avaliacao`

## Forecast — Lógica

- **Dados SZI:** `squad_deals` (filtro `is_marketing=true`, `empreendimento IS NOT NULL`)
- **Dados SZS:** `szs_deals` (todos os canais)
- **Lógica:**
  1. **Já Ganhos:** deals WON no mês corrente (`status=won`, `won_time >= mes_inicio`)
  2. **Pipeline:** deals abertos por etapa × taxa de conversão histórica 90d por etapa
  3. **Taxa conversão por etapa:** de todos os deals que passaram pela etapa X (`max_stage_order >= X`) nos últimos 90d (filtro `add_time >= 90d`), qual % virou WON. Excluir `lost_reason = 'Duplicado/Erro'` em JS (não no Supabase, por causa do bug do `neq` com NULLs)
  4. **Leadtime por etapa:** tempo médio (média, não mediana — mais conservador) da etapa até WON. Usa deals que FECHARAM nos últimos 90d (`won_time >= 90d`, query separada). Fórmula SZI: `ciclo_total × (14 - stage_order) / 13`. SZS: `ciclo_total × (12 - stage_order) / 11`
  5. **Forecast = Já Ganhos + Pipeline**
- **Ranges:** pessimista (pipeline ×0.7), esperado (×1.0), otimista (×1.3)
- **Metas SZI:** `nekt_meta26_metas.won_szi_meta_pago + won_szi_meta_direto` via service role key. Divide por `V_COLS.length` closers e distribui por squad
- **Metas SZS:** `nekt_meta26_metas` campos por canal (`won_szs_meta_pago`, `won_szs_meta_parceiro`, `won_szs_meta_exp`, `won_szs_meta_spot`, `won_szs_meta_direto`)
- **CUIDADO queries de leadtime vs conversão:** conversão usa `add_time >= 90d` (deals criados no período). Leadtime usa `won_time >= 90d` (deals que fecharam no período, independente de quando foram criados). Misturar os filtros gera leadtimes artificialmente curtos
- **CUIDADO datas UTC:** `new Date("2026-03-01")` em BRT (UTC-3) vira 28/fev 21h. Usar `new Date("2026-03-01T12:00:00")` para exibição de mês

## View Resultados (Funil Comercial)

- **Funil:** Leads > MQL > SQL > OPP > Reserva > Contrato > WON + Investimento
- **Leads** = leads Meta Ads (`leads_month`) + MQLs de outros canais (`max(MQL - leads_meta, 0)`)
- **MQL/SQL/OPP/WON** = `squad_daily_counts` filtrado pelo mês (open + won + lost)
- **Reserva/Contrato (cards)** = snapshots de deals nos stages 191/192 (sem filtro de data, estado atual)
- **Reserva/Contrato (conversões)** = coorte de deals fechados no mês via `squad_deals`. Conta deals por `max_stage_order`: OPP (>=9), Reserva (>=13), Contrato (>=14), WON (status=won). Exclui `lost_reason = 'Duplicado/Erro'` em JS. Filtro: `won_time >= mesInicio OR lost_time >= mesInicio`
- **IMPORTANTE:** Cards e conversões usam fontes DIFERENTES. Card = `squad_daily_counts` (acumulado/snapshot). Conversão = `squad_deals` (coorte de fechados). NÃO misturar — gera percentuais absurdos (ex: 600% quando snapshot tem 2 e WON tem 12)
- **Investimento** = `spend_month` do Meta Ads (somente gasto do mês corrente)
- **Custos:** CMQL (spend/MQL), COPP (spend/OPP), CPW (spend/WON) — todos usando dados do mês

## Backlog — Contribuições GitHub

- **Repo:** `seazone-socios/saleszone` (migrado de `fernandopereira-ship-it/squad-dashboard`)
- **Matching duplo:** primário por `github_username` (campo em `user_profiles`), fallback por email (busca email público do GitHub via `/users/{login}`)
- **CUIDADO github_username vs login real:** o `github_username` cadastrado no Admin deve ser o login usado para commitar. Se commita como `ambrosi-seazone` mas Admin tem `mathambrosi`, o match direto falha
- **CUIDADO GitHub API 202:** stats API retorna 202 enquanto computa. Rota faz retry até 3x com delay de 2s
- **CUIDADO cache Vercel:** rota usa `force-dynamic` e `cache: "no-store"`. Logs em Vercel Function Logs (`[contributions]`)
