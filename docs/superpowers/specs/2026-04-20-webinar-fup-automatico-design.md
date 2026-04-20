# Webinar FUP Automático — Design

**Data:** 2026-04-20
**Autor:** JP Coutinho (Seazone)
**Status:** Draft — aguardando aprovação
**Escopo:** Piloto closer Mayara Marques; número `+5548936182939`

## Motivação

Após cada call comunitária (webinar), a Mayara se compromete com os presentes de continuar o papo via WhatsApp — enviar orçamento de enxoval, esclarecer dúvidas, mandar apresentação. Hoje esse FUP é manual: a Mayara precisa abrir cada lead, copiar número, abrir Timelines, digitar mensagem. Em dias com 15–30 presentes, o FUP atrasa ou se perde.

Este projeto automatiza o **primeiro contato pós-call** — uma mensagem padrão no WhatsApp da Mayara, disparada assim que ela marca um lead como oportunidade no admin do webinar. A Mayara assume a conversa a partir da resposta do lead.

Se o piloto funcionar, a base pode ser estendida para outros closers e outros gatilhos (ex.: pós-reunião 1:1 via Fireflies).

## Escopo

**Entra:**
- Disparo automático de 1 mensagem WhatsApp ao lead, via conta Timelines da Mayara, ao marcar `is_opportunity = true` no admin do webinar.
- Migration no Supabase do webinar-platform para campo `fup_sent_at` (dedup).
- Endpoint Flask `PATCH /api/admin/registrations/{id}` (não existe hoje) — atualiza o registration e, quando aplicável, dispara o FUP.
- Cliente Python para Timelines.ai em `backend/services/timelines.py`.
- Modo dry-run controlado por env var (primeira semana apenas loga).
- Log de cada disparo no DM do JP no Slack.

**Não entra:**
- Fluxo de respostas do lead (Mayara assume manualmente no Timelines).
- Envio para outros closers (só Mayara no piloto).
- Disparo para não-oportunidade / no-show.
- Segunda mensagem, follow-up 2, templates por segmentação.
- Movimentação de stage no Pipedrive a partir do mesmo PATCH (está fora do escopo deste spec — se já existe ou vem a existir, é ortogonal).

## Arquitetura

Disparo inline no backend Flask do webinar-platform (alternativa A escolhida durante brainstorming). Não há polling nem cron — o gatilho é o próprio PATCH do admin.

```
Mayara (admin) clica "Sim, foi oportunidade"
        │
        ▼
PATCH /api/admin/registrations/{id}   (Flask, backend/routes/admin.py)
        │
        ├── UPDATE webinar_registrations
        │     SET is_opportunity=true, opportunity_marked_at=now()
        │
        ├── Condição de disparo:
        │     is_opportunity transicionou de false/null → true
        │     AND attended_at IS NOT NULL
        │     AND fup_sent_at IS NULL
        │     AND phone IS NOT NULL (não vazio)
        │     AND registration.closer = Mayara  (via session.closer_id)
        │
        ├── Se DRY_RUN_FUP=true:
        │     Slack DM para JP com preview (sem enviar)
        │     (NÃO marca fup_sent_at — ciclo repete se PATCH re-disparar)
        │
        └── Se DRY_RUN_FUP=false:
              1. services.timelines.send_message(phone, text)
              2. UPDATE webinar_registrations SET fup_sent_at=now()
              3. Slack DM para JP (auditoria)
              4. Qualquer falha: log + não bloqueia o response do PATCH
```

### Fluxo de erro

Toda a integração com Timelines/Slack é *best-effort* (segue o padrão já usado no `routes/registrations.py` para Pipedrive/Calendar/Morada). Falha no envio **não** bloqueia o PATCH nem propaga 500 ao frontend — é logada em `print(...)` (padrão do projeto) e em Slack. Esse é o contrato atual do backend e não vamos alterá-lo aqui.

**Trade-off aceito:** se o Timelines falhar silenciosamente, o `fup_sent_at` NÃO é marcado (só é marcado após `send_message` retornar sucesso). Ou seja, um segundo PATCH re-dispararia. Risco: double-send se o Timelines devolver erro mas a mensagem ter sido enviada. Mitigação: log do payload de retorno; se virar problema recorrente, adicionar retry idempotente num próximo ciclo.

## Alterações no schema

Migration nova em `scripts/webinar-platform/sql/` (pasta já existe com padrão `NNN_descritivo.sql` — hoje tem `001_create_tables.sql` e `002_add_closers.sql`). Arquivo: `003_add_fup_sent_at.sql`.

Observação: as colunas `is_opportunity`, `opportunity_marked_at`, `no_show_at`, `fireflies_transcript_id`, `transcript_summary`, `transcript_synced_at`, `pipedrive_transcript_note_id`, `pipedrive_deal_url`, `observacoes`, `cidade`, `tipo_imovel` existem no banco mas **não** em nenhum arquivo SQL versionado — foram adicionadas ad-hoc. O plan deve decidir se esta migration também re-declara essas colunas com `IF NOT EXISTS` (para alinhar o arquivo ao banco) ou apenas adiciona o novo campo. Recomendação: só adicionar o novo — correção do histórico vira outro ticket.

```sql
ALTER TABLE webinar_registrations
  ADD COLUMN IF NOT EXISTS fup_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_webinar_registrations_fup_pending
  ON webinar_registrations (is_opportunity, fup_sent_at)
  WHERE is_opportunity = true AND fup_sent_at IS NULL;
```

Só um campo. Sem enum novo, sem tabela nova. Dedup vive na mesma linha do registro — natural.

## Componentes

### 1. `backend/services/timelines.py` (novo)

Segue o padrão dos demais services (`pipedrive.py`, `morada.py`): stdlib-only (`urllib`), funções de módulo, best-effort.

Interface mínima:

```python
def find_chat_id(phone: str) -> int | None:
    """GET /chats?phone={phone}. Retorna chat_id numérico ou None."""

def send_message(chat_id: int, text: str) -> dict | None:
    """POST para enviar mensagem ao chat. Retorna response ou None em erro."""
```

Config em `config.py`: `TIMELINES_API_TOKEN`, `TIMELINES_WA_ACCOUNT` (a conta WhatsApp da Mayara — a API Timelines exige specificar qual número envia quando a conta tem múltiplas instâncias).

Base URL: `https://app.timelines.ai/integrations/api` (confirmado na memória do JP — NÃO `api.timelines.ai`).
Auth: header `Authorization: Bearer {token}`.

**Restrição do escopo piloto:** o token Timelines configurado deve ser o da conta que enxerga `+5548936182939`. Se a conta Mayara ainda não tiver API key gerada, o piloto fica bloqueado — essa é uma dependência para o plano de implementação.

### 2. `backend/services/pipedrive.py` (sem mudanças)

O spec não toca no Pipedrive. Movimentação de stage permanece como está (se existe em outro lugar, sem interferência).

### 3. `backend/routes/admin.py` — novo handler

```python
@bp.route("/registrations/<reg_id>", methods=["PATCH"])
def update_registration(reg_id):
    # 1. Busca registration atual (para detectar transição)
    # 2. Aplica UPDATE no Supabase com os campos do body
    # 3. Se aplicável, chama fup_hook(previous, updated)
    # 4. Retorna 200 com updated
```

Hook isolado em `backend/services/webinar_fup.py` (mantém `admin.py` focado em roteamento; mantém integração Timelines testável em isolamento).

### 4. Template da mensagem

Mensagem única (decidida no brainstorming — Opção 1):

```
Oi {primeiro_nome}, aqui é a Mayara da Seazone!

Obrigada por participar da call hoje. Passando aqui pra continuar nosso papo por um canal mais direto — qual foi o ponto que mais te chamou atenção na apresentação?

E se quiser, já me manda quantos leitos tem o seu imóvel que eu preparo o orçamento de enxoval pra você.
```

- `{primeiro_nome}` = `registration.name.split()[0]` (primeira palavra do nome).
- Fallback: se `name` estiver vazio (não deveria por schema, mas defensivo), usa `"oi!"` no lugar e loga aviso.
- Texto hard-coded no `services/webinar_fup.py` (uma constante). Não vamos criar sistema de templates — YAGNI.

## Guard-rails

1. **DRY_RUN padrão `true`.** Flag no `.env`/config. Primeira semana operando sem enviar nada — só Slack preview.
2. **Dedup por `fup_sent_at`.** Só marca após `send_message` OK. Segundo PATCH no mesmo lead não re-dispara depois de enviado.
3. **Whitelist de closer.** Resolução: a partir do `registration.session_id`, fazer JOIN em `webinar_sessions.closer_id`, e dessa em `webinar_closers.slug`. Comparar contra env var `FUP_ALLOWED_CLOSER_SLUG=mayara-marques` (não hard-code). Outros closers ignorados silenciosamente. Observação: o `require_admin()` atual apenas valida que o requester é `@seazone.com.br` — ele não identifica *qual* closer está logado, então a whitelist é do **dono da sessão** (quem apresentou), não do usuário autenticado.
4. **Cutoff de atendimento.** Se `attended_at` for `NULL`, não dispara (não envia FUP pra quem não esteve presente, mesmo que tenha virado oportunidade).
5. **Validação de telefone.** Se `phone` for vazio/inválido (básico: ≥ 10 dígitos), skip + log. Sem tentativa de correção.
6. **Log Slack obrigatório.** Todo disparo (real ou dry-run) é logado no DM `D07M0MKUJUS` (JP) com: reg_id, deal_id, nome, phone, sessão, mensagem final, resultado. Auditoria retroativa.
7. **Kill switch.** Flipar `DRY_RUN_FUP=true` no `.env` interrompe envios imediatamente sem redeploy — só reload do backend.

## Observabilidade

- Logs `print(...)` prefixados `[webinar-fup]` (padrão do projeto).
- Slack DM no JP por disparo (tempo real).
- Coluna `fup_sent_at` permite contar no Supabase: quantos FUPs foram enviados, distribuição por sessão, taxa de resposta (precisa join com Timelines — fora de escopo).

## Testes

Projeto já tem `backend/tests/` com pytest (inclui `test_admin.py`). Adicionar:

1. Novos casos em **`backend/tests/test_admin.py`** (complementa o existente):
   - 200 + update simples quando body não muda `is_opportunity`.
   - 200 + dispara FUP quando `is_opportunity` vira true e condições OK.
   - 200 + NÃO dispara quando `attended_at` é null.
   - 200 + NÃO dispara quando `fup_sent_at` já existe.
   - 200 + NÃO dispara quando closer ≠ Mayara.
   - 200 + modo dry-run não chama `timelines.send_message`.

2. **`backend/tests/test_webinar_fup.py`** (unit do hook, novo arquivo)
   - `_should_send_fup(previous, updated, closer_slug)` retorna True/False correto em cada combinação.
   - Formatação do template com nome composto, nome com 1 palavra, nome vazio.

3. **`backend/tests/test_timelines.py`** (smoke, mocks HTTP, novo arquivo)
   - `find_chat_id` parseia response corretamente.
   - `send_message` monta payload correto.

Mocks do `urllib.request.urlopen` para não bater em API real (segue padrão dos testes já existentes do projeto).

## Rollout

**Dia 1 (pós-merge, dry-run):**
- Migration aplicada.
- `DRY_RUN_FUP=true` em produção.
- Próxima semana de webinars da Mayara: JP e Mayara validam cada preview no Slack antes de aprovar texto/timing.

**Dia ~7 (se validado):**
- Flipar `DRY_RUN_FUP=false`.
- Acompanhar 1ª semana de envios reais com atenção a double-sends, telefones inválidos, reclamações da Mayara sobre mensagem fora de contexto.

**Dia ~14:**
- Decisão: escalar para outros closers (remover whitelist ou ampliá-la), iterar no template, ou reverter.

## Riscos

1. **Envio indevido** (mensagem errada pro lead certo, ou certa pro lead errado). Mitigações: dry-run, dedup, whitelist, template estático. Impacto residual: baixo-médio — tom do texto é genérico o bastante pra não criar situação estranha se disparar pro lead errado.
2. **Dependência da chave Timelines da Mayara.** Se a conta não tiver API key, piloto bloqueia. Precisa ser confirmado antes da implementação.
3. **Endpoint `PATCH /admin/registrations/{id}` pode já existir** em Edge Function separada ou versão mais nova do backend que não está neste snapshot do repo. Se existir, o plano deve **estender** em vez de criar. Plan deve validar isso no `app.py` + Edge Function Deno (`ljsvkaidlzflewnimupz/functions/v1/webinar-api`) antes de codar.
4. **Timelines mudou API.** Conforme memória: base URL correta é `app.timelines.ai/integrations/api`, auth Bearer. Se o endpoint de send for diferente do documentado, ajustar em `services/timelines.py` com verificação real (curl) durante implementação.
5. **Lead com dois registros na mesma sessão.** Improvável pelo schema (não há unique), mas se acontecer, só o primeiro a virar oportunidade dispara — os demais seguem a mesma lógica (não há cross-lookup).

## Fora de escopo (explicitamente adiado)

- FUP pós-reunião 1:1 (sem webinar) — outro gatilho, outra fonte (Fireflies).
- FUP 2 / retargeting de no-response — depende de sinal de resposta que ainda não temos.
- Personalização por objeção apresentada no webinar — exigiria análise da transcrição (Fireflies) ainda não integrada ao admin do webinar.
- Movimentação automática de stage Pipedrive aqui — tratado em outro spec/fluxo se/quando existir.
- Painel no admin com histórico de FUPs — coluna `fup_sent_at` está disponível; UI fica para depois.

## Perguntas abertas

Nenhuma bloqueante. Dois pontos a confirmar no início do plan:

- Confirmar que a API key Timelines da Mayara existe e enxerga `+5548936182939`.
- Confirmar se `PATCH /admin/registrations/{id}` já existe em algum lugar do stack (Edge Function Deno ou Flask) para evitar duplicar.
