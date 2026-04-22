# BPMN — Processo Piloto Click-to-WhatsApp (Vendas Spot)

**Data:** 2026-03-31
**Status:** Piloto
**Pipeline:** Vendas Spot (Pipedrive)
**Escopo:** Substituir formulário de marketing por qualificação via conversa WhatsApp com MIA (Morada)

---

## 1. Estrutura do Diagrama

### Pool
- **Nome:** Processo Piloto Click-to-WhatsApp — Vendas Spot

### Lanes (3)

| Lane | Ator | Cor sugerida (Miro) |
|------|-------|---------------------|
| Marketing | Meta Ads + Lead | Azul claro |
| Morada/MIA | IA da Morada + Automação Pipedrive | Verde claro |
| Pré-vendas | SDR humano | Amarelo claro |

---

## 2. Elementos BPMN

### Legenda de símbolos

| Símbolo | Tipo BPMN | Shape no Miro |
|---------|-----------|---------------|
| Círculo fino | Evento de início | Circle (verde) |
| Círculo grosso | Evento de fim | Circle (vermelho) |
| Retângulo arredondado | Atividade/Tarefa | Rounded rectangle |
| Losango | Gateway exclusivo (XOR) | Diamond com X |
| Seta | Fluxo de sequência | Arrow |
| Seta tracejada | Fluxo de mensagem (cross-lane) | Dashed arrow |

---

## 3. Fluxo Completo

### Lane: Marketing

| # | Tipo | Elemento | Detalhe |
|---|------|----------|---------|
| 1 | Evento de início | Lead clica no anúncio | Meta Click-to-WhatsApp |
| 2 | Atividade | Lead envia mensagem para Morada | WhatsApp — inicia conversa |
| — | Fluxo de mensagem | → Transição para Lane Morada/MIA | Seta tracejada cross-lane |

### Lane: Morada/MIA

| # | Tipo | Elemento | Detalhe |
|---|------|----------|---------|
| 3 | Atividade | Automação cria deal no Pipedrive | Stage: Lead in · Owner: Automação · Campos: RD Source (Click to WhatsApp) + metadados Meta |
| 4 | Atividade | MIA inicia conversa de qualificação | Via Morada (WhatsApp) |
| 5 | Gateway XOR | Lead respondeu? | — |
| 5a | (Não) Atividade | Aguarda cadência da automação | Timer — cadência padrão |
| 5b | (Não) Gateway XOR | Respondeu dentro da cadência? | — |
| 5b-N | (Não) Atividade | MIA dá Lost + encerra conversa | Pipedrive: Lost · Morada: encerra |
| 5b-F | Evento de fim | Processo encerrado (sem resposta) | Círculo vermelho |
| 5b-S | (Sim) | Retorna ao fluxo principal | Volta ao elemento 5a-S (Move para Contatados) |
| 5a-S | (Sim) Atividade | Move deal para Contatados | Pipedrive: stage Contatados · Executado pela Automação |
| 6 | Atividade | MIA faz perguntas de qualificação | Campos: forma de pagamento, investimento/uso próprio, valor pretendido |
| 7 | Gateway XOR | Lead qualificado? | Critério: compatibilidade com empreendimento (ex: valor dentro da faixa) |
| 7-N | (Não) Atividade | MIA dá Lost + encerra conversa | Pipedrive: Lost · Morada: encerra |
| 7-F | Evento de fim | Processo encerrado (não qualificado) | Círculo vermelho |
| 8 | Gateway XOR | MIA sabe responder E lead não pede humano? | Dois gatilhos de transbordo |
| 8-S | (Sim) | Avança para proposta de agenda | Segue para elemento 9 |
| 8-N | (Não) | Transbordo → Lane Pré-vendas | Seta tracejada cross-lane · Owner → Pré-vendas |
| 9 | Atividade | MIA propõe agenda | Move deal para Aguardando data |
| 10 | Gateway XOR | Lead aceita agenda? | — |
| 10-N | (Não/sem resposta) | Transbordo → Lane Pré-vendas | Seta tracejada cross-lane · Owner → Pré-vendas |
| 11 | Atividade | MIA envia convite + agenda reunião | Move deal para Agendado · Status Reunião: Confirmada · Owner → Closer |
| 12 | Evento de fim (Link) | Handoff → Processo existente | Círculo vermelho com símbolo de link (seta saindo) — indica continuidade em outro processo |

### Lane: Pré-vendas

| # | Tipo | Elemento | Detalhe |
|---|------|----------|---------|
| 13 | Atividade | SDR assume conversa (transbordo) | Owner transferido para Pré-vendas. Nota: SDR recebe leads em dois contextos — (a) transbordo durante qualificação (Gateway 8) e (b) follow-up de lead qualificado em Aguardando data (Gateway 10). Ambos seguem o mesmo fluxo de pré-vendas |
| 14 | Evento de fim (Link) | Handoff → Processo existente de Pré-vendas | Círculo vermelho com símbolo de link |

---

## 4. Gateways — Regras de Negócio

| Gateway | Tipo | Condição SIM | Condição NÃO |
|---------|------|-------------|--------------|
| Lead respondeu? | XOR | Qualquer mensagem do lead | Sem resposta → entra em cadência |
| Respondeu dentro da cadência? | XOR | Mensagem antes do timeout | Cadência expirou → Lost. **Nota:** "cadência padrão" = cadência configurada na automação da Morada (quantidade de tentativas e intervalo entre elas). Anotar no sticky note do gateway |
| Lead qualificado? | XOR | Respostas compatíveis com empreendimento | Perfil incompatível → Lost |
| MIA sabe responder / lead não pede humano? | XOR | MIA tem resposta E lead não pediu humano | MIA sem resposta OU lead pede humano → Transbordo |
| Lead aceita agenda? | XOR | Lead confirma horário | Sem resposta ou recusa → Transbordo |

---

## 5. Artefatos de Dados (Pipedrive)

### Campos preenchidos durante o processo

| Campo | Preenchido por | Momento |
|-------|---------------|---------|
| RD Source (Click to WhatsApp) | Automação | Criação do deal |
| Metadados Meta (campanha, ad set) | Automação | Criação do deal |
| Forma de pagamento | MIA | Qualificação |
| Investimento ou uso próprio | MIA | Qualificação |
| Valor pretendido | MIA | Qualificação |
| Status Reunião | MIA | Agendamento |

### Movimentações de stage no Pipedrive

| De | Para | Gatilho |
|----|------|---------|
| (criação) | Lead in | Automação cria deal |
| Lead in | Contatados | Lead respondeu |
| Contatados | Aguardando data | MIA propõe agenda |
| Aguardando data | Agendado | Lead aceita agenda |
| Qualquer | Lost | Não qualificado ou sem resposta |

### Transferências de owner

| De | Para | Gatilho |
|----|------|---------|
| Automação | Automação | Mantém durante MIA |
| Automação | Pré-vendas | Transbordo |
| Automação | Closer | Agendamento confirmado |

---

## 6. Instruções para Montagem no Miro

### Passo a passo

1. **Criar o Pool** — retângulo grande horizontal, título "Processo Piloto Click-to-WhatsApp — Vendas Spot"
2. **Dividir em 3 lanes** — linhas horizontais: Marketing (topo), Morada/MIA (meio, maior), Pré-vendas (base)
3. **Lane Marketing** — posicionar da esquerda para direita:
   - Círculo verde (início) → Retângulo "Lead clica no anúncio CTA WhatsApp" → Retângulo "Lead envia mensagem para Morada"
   - Seta tracejada descendo para Lane Morada/MIA
4. **Lane Morada/MIA** — sequência principal:
   - Retângulo "Cria deal no Pipedrive (Lead in)" → Retângulo "MIA inicia qualificação"
   - Losango "Respondeu?" → ramificação Sim/Não
   - Caminho Não: Retângulo "Aguarda cadência" → Losango "Respondeu na cadência?" → Não: Retângulo "Lost + encerra" → Círculo vermelho
   - Caminho Sim: Retângulo "Move para Contatados" → Retângulo "MIA qualifica (perguntas)"
   - Losango "Qualificado?" → Não: Retângulo "Lost + encerra" → Círculo vermelho
   - Sim: Losango "MIA sabe responder / lead não pede humano?" → Não: seta tracejada para Pré-vendas
   - Sim: Retângulo "MIA propõe agenda (Aguardando data)"
   - Losango "Aceita agenda?" → Não: seta tracejada para Pré-vendas
   - Sim: Retângulo "MIA envia convite + agenda (Agendado) + owner → Closer" → Círculo vermelho (fim — acopla processo existente)
5. **Lane Pré-vendas** — recebe setas tracejadas:
   - Retângulo "SDR assume conversa" → Círculo vermelho (fim — segue processo existente)
6. **Conectar** — setas sólidas dentro da lane, setas tracejadas entre lanes
7. **Anotar** — usar sticky notes para regras de negócio nos gateways

### Dicas visuais
- Gateways: usar losango com **X** dentro (padrão BPMN para XOR)
- Eventos de fim Lost: usar círculo vermelho com label "Lost"
- Eventos de fim com handoff (elementos 12 e 14): usar círculo vermelho com **símbolo de link** (seta saindo) + label "→ Processo existente". Em BPMN, isso indica que o processo continua em outro diagrama, diferente de um fim simples (terminação)
- Campos Pipedrive: adicionar como data objects (retângulo com canto dobrado) conectados por associação pontilhada às atividades relevantes

---

## 7. Diferenças vs Processo Padrão

| Aspecto | Processo Padrão | Processo Piloto |
|---------|----------------|-----------------|
| Origem | Formulário marketing → MQL | Click-to-WhatsApp → conversa direta |
| Qualificação | Formulário preenchido pelo lead | MIA qualifica via conversa |
| Primeiro contato | MIA liga ativamente (outbound) | Lead inicia conversa (inbound) |
| Campo RD Source | Outros valores | Click to WhatsApp |
| Etapas Pipedrive puladas | Nenhuma | Qualificação e Qualificado (qualificação acontece na conversa) |

---

## 8. Expansão Futura

- **Próximos funis:** Todos os pipelines com origem de marketing (Marketplace, Decor, SZS)
- **Adaptação necessária:** Critérios de qualificação variam por empreendimento/funil
- **Estrutura reutilizável:** Lanes e gateways são os mesmos, mudam os critérios nos gateways
