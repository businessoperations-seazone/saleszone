# BPMN — Processo Webinar (Call Comunitaria)

## Contexto

A Seazone realiza calls comunitarias (webinars) como alternativa a reuniao 1:1 para apresentacao do modelo de negocio. A closer Mayara Marques e a cobaia do processo, que sera escalado para todos os canais e closers.

A plataforma de webinar ja existe: https://frontend-nine-ivory-62.vercel.app

## Objetivo

Mapear o processo BPMN das calls comunitarias com 3 entradas (MIA, SDR, Externo), convergindo para a call e com 3 saidas possiveis (oportunidade, lost, no-show).

## Pipeline e Etapas Pipedrive

- **Pipeline:** Comercial SZS (14)
- **Etapa destino:** Agendado (stage 73)
- **Titulo do deal:** `[webinar] Nome - Cidade`
- **No-show:** No Show (stage 342)
- **Oportunidade:** Reuniao Realizada (stage 151)
- **Nao oportunidade:** Lost

## Entradas

### 1. MIA

Lead converte em campanha e recebe primeira mensagem automatica.

1. **Campanha** → Lead converte → Deal criado no Pipedrive (pipeline SZS)
2. **MIA qualifica** o lead (padrao SZS — perguntas de qualificacao)
3. **Gateway qualificacao:**
   - **Qualificado:** MIA agenda na call comunitaria → Deal move para "Agendado" (73) com titulo `[webinar] Nome - Cidade`
   - **Nao qualificado:** Deal marcado como Lost

### 2. SDR

SDR ja possui o link da plataforma de webinar. O lead nao tem acesso direto.

1. **Campanha** → Lead converte → Deal criado no Pipedrive (pipeline SZS)
2. **SDR envia link** da call comunitaria ao lead
3. **Lead se inscreve** na plataforma de webinar
4. **SDR atualiza deal manualmente** → "Agendado" (73) com titulo `[webinar] Nome - Cidade`

### 3. Externo (futuro — fora do escopo do piloto Mayara)

Lead chega diretamente via campanha (Meta Ads, link na bio, etc.) sem intermediario.

1. **Campanha** → Lead acessa plataforma diretamente
2. **Lead se inscreve** na plataforma de webinar
3. **Confirma agendamento** → Deal criado no Pipedrive (pipeline SZS) na etapa "Agendado" (73) com titulo `[webinar] Nome - Cidade`

**Diferenca:** Na entrada externa, o Deal so e criado na confirmacao do agendamento (nao na conversao da campanha como MIA/SDR).

## Convergencia — Call Comunitaria

Todas as 3 entradas convergem para a mesma call comunitaria:

- **Closer** (Mayara, futuramente outros) apresenta o modelo Seazone
- **Plataforma:** Chat ao vivo, CTA acionado pelo apresentador
- **Admin do webinar:** Apresentador usa painel admin para controlar a sessao

## Saidas Pos-Call

O apresentador avalia cada lead no admin da plataforma de webinar. A classificacao e binaria: o apresentador marca explicitamente "Oportunidade" no admin. Leads nao marcados sao considerados "nao oportunidade".

**No piloto (Mayara):** a atualizacao dos deals no Pipedrive e feita manualmente pelo apresentador/operador apos a call. A integracao automatica (admin → Pipedrive via API) e escopo futuro.

### Participou

| Classificacao | Acao Pipedrive | Proximo passo |
|---|---|---|
| **Oportunidade (marcado no admin)** | Deal → "Reuniao Realizada" (151) | FUP normal pela closer |
| **Nao oportunidade (nao marcado)** | Deal → Lost | Encerrado |

**Todos os deals devem ser atualizados** — sejam presentes ou nao, oportunidade ou nao.

### Nao participou (No-Show)

| Acao Pipedrive | Proximo passo |
|---|---|
| Deal → "No Show" (342) | Pre-vendas atua no reengajamento |

## Atores (Lanes BPMN)

| Lane | Responsavel | Acoes |
|---|---|---|
| **MIA** | IA (Morada) | Qualifica lead, agenda call |
| **SDR** | Pre-vendedor | Envia link ao lead |
| **Externo** | Lead (self-service) | Se inscreve e confirma |
| **Closer** | Apresentador (Mayara) | Conduz call, classifica oportunidade no admin |
| **Pre-vendas** | Time de pre-vendas | Atua em no-shows |

## Diagrama BPMN

```
ENTRADA MIA:
  Campanha → Deal criado → Qualifica SZS → [Qualificado?]
    → Sim: Agenda call → AGENDADO
    → Nao: LOST

ENTRADA SDR:
  Campanha → Deal criado → SDR envia link → Lead inscreve → AGENDADO

ENTRADA EXTERNO:
  Campanha → Lead inscreve → Confirma agendamento (Deal criado) → AGENDADO

CONVERGENCIA:
  AGENDADO → Call Comunitaria (closer apresenta)

POS-CALL:
  → [Participou?]
    → Sim: [Oportunidade?]
      → Sim: Reuniao Realizada (151) → FUP
      → Nao: LOST
    → Nao: No Show (342) → Pre-vendas atua
```

## Notas de Implementacao

- **Stage 73 compartilhada:** A etapa "Agendado" e usada tanto para reunioes 1:1 quanto webinars. O prefixo `[webinar]` no titulo do deal e o diferenciador. Queries e relatorios devem filtrar por `title LIKE '[webinar]%'` alem do stage_id.
- **Piloto:** Somente entradas MIA e SDR estao em escopo. Entrada externa e desenho futuro.

## Escopo Futuro

- Escalar para todos os closers (cada um com suas calls)
- Entrada externa via Meta Ads (campanhas dedicadas)
- Integracao automatica plataforma webinar ↔ Pipedrive (admin marca oportunidade → API move deal automaticamente)
