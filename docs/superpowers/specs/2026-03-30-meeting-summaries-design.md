# Meeting Summaries — Design Spec

## Objetivo
Automacao que processa transcripts (.docx) de reunioes gravadas no Google Meet, gera resumos estruturados via Claude API e envia por Slack DM.

## Reunioes Monitoradas

### Daily
- **Daily - Comercial** — Seg-Sex, horario varia (08:30-11:00)

### Weeklies
- Weekly Decor<>Expansao — Seg 13:30
- Weekly EXP Comercial — Seg 14:00
- Weekly - Comercial SZI — Seg 15:30
- Weekly - Vendas SZS — Seg 16:00
- Weekly - Pre-vendas SZS — Seg 16:30
- Weekly - Comercial Decor — Seg 17:00
- Weekly - Comercial — Ter 14:00
- Weekly - Ops — Seg 15:00
- Weekly - Decor comercial — Ter 17:30

## Arquitetura

```
~/Claude-Code/saleszone/scripts/meeting-summaries/
├── config.py          # tokens (.env), mapa de reunioes
├── .env               # GOOGLE_SERVICE_ACCOUNT_KEY_PATH, ANTHROPIC_API_KEY, SLACK_BOT_TOKEN
├── collector.py       # entry point — lista Drive, filtra, baixa .docx
├── summarizer.py      # extrai texto do .docx, envia p/ Claude API
├── notifier.py        # formata e envia Slack DM
├── processed.json     # IDs de arquivos ja processados
└── .gitignore         # .env, processed.json
```

## Fluxo

1. launchd dispara `collector.py` nos horarios programados
2. Autentica na Google Drive API (Service Account)
3. Lista arquivos .docx na pasta `1YtbzwYAsWUIbRKKxVADlQIVfvM1s3-3S`
4. Filtra: nome contem "Daily - Comercial" ou comeca com "Weekly -", criado nas ultimas 2h, nao esta em processed.json
5. Baixa o .docx, extrai texto via python-docx
6. Envia para Claude Sonnet com prompt de pilares estruturados
7. Formata resumo e envia Slack DM para JP (D07M0MKUJUS)
8. Registra file ID em processed.json

## Pilares de Avaliacao

1. **Decisoes tomadas** — o que foi decidido
2. **Action items** — quem faz o que, prazos
3. **Problemas levantados** — bloqueios, riscos, alertas
4. **Destaques positivos** — resultados, conquistas
5. **Proximos passos** — o que acontece a seguir

## Agendamento (launchd)

| Horario | Processamento |
|---------|---------------|
| Seg-Sex 11:30 | Daily - Comercial |
| Seg 18:00 | Weeklies de segunda |
| Ter 15:30 | Weekly - Comercial |
| Ter 18:30 | Weekly - Decor comercial |

## Dependencias

- `python-docx` — extrair texto do .docx
- `anthropic` — ja no requirements.txt
- `google-auth` + `google-api-python-client` — Drive API

## Configuracao

1. Habilitar Drive API no projeto GCP da Service Account
2. Compartilhar pasta do Drive com email da Service Account
3. Chave JSON da Service Account

## Entrega

- Slack DM para JP (D07M0MKUJUS)
- Formato: mensagem estruturada com os 5 pilares
- Uma mensagem por reuniao processada

## Pasta Google Drive

- ID: `1YtbzwYAsWUIbRKKxVADlQIVfvM1s3-3S`
- URL: https://drive.google.com/drive/u/0/folders/1YtbzwYAsWUIbRKKxVADlQIVfvM1s3-3S
- Formato transcripts: .docx (gerado automaticamente pelo Google Meet)
