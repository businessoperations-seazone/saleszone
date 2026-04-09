"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { T } from "@/lib/constants"
import { createClient } from "@/lib/supabase/client"

// ─── Tipos ────────────────────────────────────────────────────────────────────

type SlaRow = {
  id: number
  vertical: "SZI" | "Marketplace" | "Serviços"
  table: string
  nome: string
  status: boolean
  commercial_squad: string
  mql_intencoes: string[]
  mql_faixas: string[]
  mql_pagamentos: string[]
}

// ─── Config por vertical ──────────────────────────────────────────────────────

type ColDef = {
  label: string
  field: "mql_intencoes" | "mql_faixas" | "mql_pagamentos"
  options: string[]
}

const CONFIG: Record<string, ColDef[]> = {
  SZI: [
    {
      label: "Intenção",
      field: "mql_intencoes",
      options: [
        "Investimento - renda com aluguel",
        "Investimento - valorização do imóvel",
        "Uso próprio - uso esporádico",
        "Uso próprio - moradia",
      ],
    },
    {
      label: "Faixa de Investimento",
      field: "mql_faixas",
      options: [
        "R$ 50.000 a R$ 100.000 em até 54 meses",
        "R$ 100.001 a R$ 200.000 em até 54 meses",
        "R$ 200.001 a R$ 300.000 em até 54 meses",
        "R$ 300.001 a R$ 400.000 em até 54 meses",
        "Acima de R$ 400.000 em até 54 meses",
        "À vista via PIX ou boleto",
      ],
    },
    {
      label: "Forma de Pagamento",
      field: "mql_pagamentos",
      options: [
        "À vista via PIX ou boleto",
        "Parcelado via PIX ou boleto",
        "Não tenho condição nessas opções",
      ],
    },
  ],
  Marketplace: [
    {
      label: "Intenção",
      field: "mql_intencoes",
      options: [
        "Investimento - renda com aluguel",
        "Investimento - valorização do imóvel",
        "Uso próprio - uso esporádico",
        "Uso próprio - moradia",
      ],
    },
    {
      label: "Faixa de entrada",
      field: "mql_faixas",
      options: [
        "Até R$ 30.000",
        "R$ 30.001 a R$ 50.000",
        "R$ 50.001 a R$ 80.000",
        "R$ 80.001 a R$ 150.000",
        "Acima de R$ 150.000",
      ],
    },
  ],
  Serviços: [
    {
      label: "Mobiliado?",
      field: "mql_intencoes",
      options: ["Sim", "Não", "Parcialmente mobiliado", "Não tenho imóvel"],
    },
    {
      label: "Disponibilidade",
      field: "mql_faixas",
      options: [
        "Disponível imediatamente",
        "Alugado com contrato anual",
        "Em reforma / preparação",
        "Não está disponível",
        "Já opera por temporada",
      ],
    },
    {
      label: "Ar condicionado?",
      field: "mql_pagamentos",
      options: [
        "Sim",
        "Não",
        "Não, mas estou disposto a instalar caso seja necessário",
      ],
    },
  ],
}

// ─── Labels curtos ────────────────────────────────────────────────────────────

const SHORT: Record<string, string> = {
  "R$ 50.000 a R$ 100.000 em até 54 meses":                 "50k – 100k",
  "R$ 100.001 a R$ 200.000 em até 54 meses":                "100k – 200k",
  "R$ 200.001 a R$ 300.000 em até 54 meses":                "200k – 300k",
  "R$ 300.001 a R$ 400.000 em até 54 meses":                "300k – 400k",
  "Acima de R$ 400.000 em até 54 meses":                    "Acima 400k",
  "Até R$ 30.000":                                          "Até 30k",
  "R$ 30.001 a R$ 50.000":                                  "30k – 50k",
  "R$ 50.001 a R$ 80.000":                                  "50k – 80k",
  "R$ 80.001 a R$ 150.000":                                 "80k – 150k",
  "Acima de R$ 150.000":                                    "Acima 150k",
  "Investimento - renda com aluguel":                       "Renda aluguel",
  "Investimento - valorização do imóvel":                   "Valorização",
  "Uso próprio - moradia":                                  "Moradia",
  "Uso próprio - uso esporádico":                           "Esporádico",
  "À vista via PIX ou boleto":                              "À vista",
  "Parcelado via PIX ou boleto":                            "Parcelado",
  "Não tenho condição nessas opções":                       "Sem condição",
  "Parcialmente mobiliado":                                 "Parcialmente",
  "Não tenho imóvel":                                       "Sem imóvel",
  "Disponível imediatamente":                               "Disponível",
  "Alugado com contrato anual":                             "Alugado/anual",
  "Em reforma / preparação":                                "Em reforma",
  "Não está disponível":                                    "Não disponível",
  "Já opera por temporada":                                 "Já opera",
  "Não, mas estou disposto a instalar caso seja necessário": "Disposto instalar",
}

const VERTICAL_COLOR: Record<string, string> = {
  SZI:         T.azul600,
  Marketplace: T.roxo600,
  Serviços:    T.teal600,
}

const VERTICAL_TABLE: Record<string, string> = {
  SZI:         "squad_baserow_empreendimentos",
  Marketplace: "mktp_baserow_empreendimentos",
  Serviços:    "szs_baserow_empreendimentos",
}

type VerticalTab = "SZI" | "Marketplace" | "Serviços"

// ─── Config completa dos formulários (CSV 2026-04-08) ────────────────────────

type FormQuestion = { pergunta: string; opcoes: string[] }

type LogEntry = {
  ts: string
  user: string
  vertical: string
  section: "criterios" | "formularios"
  action: "add" | "remove" | "edit" | "move"
  entity: string   // nome do empreendimento ou "P1 — Texto da pergunta"
  detail: string   // descrição legível da mudança
}

const FORMS_CONFIG: Record<string, FormQuestion[]> = {
  SZI: [
    {
      pergunta: "Você procura investimento ou para uso próprio?",
      opcoes: ["Investimento - renda com aluguel", "Uso próprio - moradia", "Uso próprio - uso esporádico", "Investimento - valorização do imóvel"],
    },
    {
      pergunta: "Qual o valor total que você pretende investir dentro de 54 meses?",
      opcoes: ["R$ 50.000 a R$ 100.000 em até 54 meses", "R$ 100.001 a R$ 200.000 em até 54 meses", "R$ 200.001 a R$ 300.000 em até 54 meses", "R$ 300.001 a R$ 400.000 em até 54 meses", "Acima de R$ 400.000 em até 54 meses", "À vista via PIX ou boleto"],
    },
    {
      pergunta: "Qual a forma de pagamento?",
      opcoes: ["À vista via PIX ou boleto", "Parcelado via PIX ou boleto", "Não tenho condição nessas opções"],
    },
  ],
  Marketplace: [
    {
      pergunta: "Você procura investimento ou para uso próprio?",
      opcoes: ["Investimento - renda com aluguel", "Uso próprio - moradia", "Uso próprio - uso esporádico", "Investimento - valorização do imóvel"],
    },
    {
      pergunta: "Qual o valor de entrada que você tem hoje?",
      opcoes: ["Até R$ 30.000", "R$ 30.001 a R$ 50.000", "R$ 50.001 a R$ 80.000", "R$ 80.001 a R$ 150.000", "Acima de R$ 150.000"],
    },
  ],
  Serviços: [
    {
      pergunta: "O imóvel para locação é mobiliado?",
      opcoes: ["Sim", "Não", "Parcialmente mobiliado", "Não tenho imóvel"],
    },
    {
      pergunta: "Qual a disponibilidade do imóvel para locação?",
      opcoes: ["Disponível imediatamente", "Alugado com contrato anual", "Em reforma / preparação", "Não está disponível", "Já opera por temporada"],
    },
    {
      pergunta: "O imóvel possui ar condicionado?",
      opcoes: ["Não, mas estou disposto a instalar caso seja necessário", "Sim", "Não"],
    },
  ],
}

// ─── Dados padrão (artefatos-growth 2026-04-08) ───────────────────────────────

const LS_KEY       = "sla-mql-rows"
const LS_FORMS_KEY = "sla-mql-forms"
const LS_LOG_KEY   = "sla-mql-log"

const I = ["Investimento - renda com aluguel", "Investimento - valorização do imóvel", "Uso próprio - uso esporádico"]
const P = ["À vista via PIX ou boleto", "Parcelado via PIX ou boleto"]
const F3 = ["R$ 200.001 a R$ 300.000 em até 54 meses", "R$ 300.001 a R$ 400.000 em até 54 meses", "Acima de R$ 400.000 em até 54 meses"]
const F2 = ["R$ 300.001 a R$ 400.000 em até 54 meses", "Acima de R$ 400.000 em até 54 meses"]

const DEFAULT_ROWS: SlaRow[] = [
  { id:  1, vertical: "SZI", table: "squad_baserow_empreendimentos", nome: "Itacaré Spot",           status: true,  commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
  { id:  2, vertical: "SZI", table: "squad_baserow_empreendimentos", nome: "Vistas de Anitá II",     status: true,  commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
  { id:  3, vertical: "SZI", table: "squad_baserow_empreendimentos", nome: "Jurerê Spot II",         status: true,  commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: F2, mql_pagamentos: P },
  { id:  4, vertical: "SZI", table: "squad_baserow_empreendimentos", nome: "Jurerê Spot III",        status: true,  commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: F2, mql_pagamentos: P },
  { id:  5, vertical: "SZI", table: "squad_baserow_empreendimentos", nome: "Marista 144 Spot",       status: false, commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: ["R$ 100.001 a R$ 200.000 em até 54 meses", ...F3], mql_pagamentos: P },
  { id:  6, vertical: "SZI", table: "squad_baserow_empreendimentos", nome: "Caraguá Spot",           status: false, commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
  { id:  7, vertical: "SZI", table: "squad_baserow_empreendimentos", nome: "Ponta das Canas Spot II",status: true,  commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
  { id:  8, vertical: "SZI", table: "squad_baserow_empreendimentos", nome: "Barra Grande Spot",      status: true,  commercial_squad: "szi_02", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
  { id:  9, vertical: "SZI", table: "squad_baserow_empreendimentos", nome: "Natal Spot",             status: true,  commercial_squad: "szi_02", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
  { id: 10, vertical: "SZI", table: "squad_baserow_empreendimentos", nome: "Bonito Spot II",         status: true,  commercial_squad: "szi_02", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
  { id: 11, vertical: "SZI", table: "squad_baserow_empreendimentos", nome: "Novo Campeche Spot II",  status: true,  commercial_squad: "szi_02", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
  { id: 12, vertical: "Marketplace", table: "mktp_baserow_empreendimentos", nome: "Marketplace", status: true, commercial_squad: "",
    mql_intencoes: ["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"],
    mql_faixas: ["R$ 30.001 a R$ 50.000","R$ 50.001 a R$ 80.000","R$ 80.001 a R$ 150.000","Acima de R$ 150.000"],
    mql_pagamentos: [] },
  { id: 13, vertical: "Serviços", table: "szs_baserow_empreendimentos", nome: "Seazone Serviços", status: true, commercial_squad: "",
    mql_intencoes: ["Sim","Não","Parcialmente mobiliado"],
    mql_faixas: ["Disponível imediatamente","Alugado com contrato anual","Em reforma / preparação","Já opera por temporada"],
    mql_pagamentos: ["Sim","Não","Não, mas estou disposto a instalar caso seja necessário"] },
]

function loadRows(): SlaRow[] {
  try {
    const s = localStorage.getItem(LS_KEY)
    if (s) return JSON.parse(s) as SlaRow[]
  } catch {}
  return DEFAULT_ROWS
}

function persist(rows: SlaRow[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(rows)) } catch {}
}

function loadForms(): Record<string, FormQuestion[]> {
  try {
    const s = localStorage.getItem(LS_FORMS_KEY)
    if (s) return JSON.parse(s) as Record<string, FormQuestion[]>
  } catch {}
  return FORMS_CONFIG
}

function persistForms(forms: Record<string, FormQuestion[]>) {
  try { localStorage.setItem(LS_FORMS_KEY, JSON.stringify(forms)) } catch {}
}

function loadLog(): LogEntry[] {
  try {
    const s = localStorage.getItem(LS_LOG_KEY)
    if (s) return JSON.parse(s) as LogEntry[]
  } catch {}
  return []
}

function persistLog(entries: LogEntry[]) {
  try { localStorage.setItem(LS_LOG_KEY, JSON.stringify(entries.slice(0, 500))) } catch {}
}

// ─── Draft state por linha em edição ─────────────────────────────────────────

type FieldDraft = {
  options:  string[]
  accepted: Set<string>
}

type Draft = {
  mql_intencoes:  FieldDraft
  mql_faixas:     FieldDraft
  mql_pagamentos: FieldDraft
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

function Pill({
  label, accepted, editing, onToggle, onRemove,
}: {
  label: string; accepted: boolean; editing: boolean
  onToggle?: () => void; onRemove?: () => void
}) {
  const short = SHORT[label] || label
  return (
    <span
      onClick={editing ? onToggle : undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 7px 3px 7px", borderRadius: 20, fontSize: 11.5,
        fontWeight: accepted ? 600 : 400, letterSpacing: "-0.01em", fontFamily: T.font,
        background: accepted ? "#DCFCE7" : "#F1F5F9",
        color:      accepted ? "#15803D" : "#CBD5E1",
        border:     `1px solid ${accepted ? "#BBF7D0" : "#E2E8F0"}`,
        cursor:     editing ? "pointer" : "default",
        transition: "background 0.12s, color 0.12s, border-color 0.12s",
        userSelect: "none",
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        {accepted
          ? <path d="M2 5.5L4.2 7.5L8 3" stroke="#15803D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          : <path d="M3 3L7 7M7 3L3 7" stroke="#CBD5E1" strokeWidth="1.4" strokeLinecap="round"/>
        }
      </svg>
      {short}
      {editing && onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          title="Remover opção"
          style={{
            background: "none", border: "none", padding: "0 0 0 2px",
            cursor: "pointer", color: "inherit", opacity: 0.55,
            fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center",
          }}
        >×</button>
      )}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SlaPage() {
  const router = useRouter()
  const [rows, setRows]         = useState<SlaRow[]>([])
  const [vertical, setVertical] = useState<VerticalTab>("SZI")
  const [pageTab, setPageTab]   = useState<"criterios" | "formularios" | "historico">("criterios")
  const [log, setLog]           = useState<LogEntry[]>([])
  const [userName, setUserName]   = useState("Usuário")
  const [userEmail, setUserEmail] = useState("")
  const [loadingData, setLoadingData] = useState(true)

  // Formulários
  const [forms, setForms]         = useState<Record<string, FormQuestion[]>>({})
  const [editingForm, setEditingForm]   = useState<{ vertical: string; qi: number } | null>(null)
  const [formDraft, setFormDraft]       = useState<{ pergunta: string; opcoes: string[] } | null>(null)
  const [formNewOpt, setFormNewOpt]     = useState("")
  const [addingFormQ, setAddingFormQ]   = useState<string | null>(null)
  const [newFormQ, setNewFormQ]         = useState("")
  const [confirmDelForm, setConfirmDelForm] = useState<{ vertical: string; qi: number } | null>(null)

  // Edição
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft]           = useState<Draft | null>(null)
  const [editStatus, setEditStatus] = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)

  // Criação
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName]     = useState("")

  // Deleção
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Adição de opção inline
  const [addingOption, setAddingOption] = useState<{ field: keyof Draft; value: string } | null>(null)

  // Carrega do localStorage na montagem + dados da API + usuário logado
  useEffect(() => {
    // Renderiza imediatamente com cache local
    setRows(loadRows())
    setForms(loadForms())
    setLog(loadLog())

    // Busca dados autoritativos da API
    async function fetchAll() {
      try {
        const [dataRes, logRes] = await Promise.all([
          fetch("/api/sla-mql").then(r => r.json()),
          fetch("/api/sla-mql/log").then(r => r.json()),
        ])
        if (dataRes.rows) { setRows(dataRes.rows); persist(dataRes.rows) }
        if (dataRes.forms) { setForms(dataRes.forms); persistForms(dataRes.forms) }
        if (logRes.entries) {
          const entries = (logRes.entries as Array<{
            ts: string; user_name: string; vertical: string
            section: string; action: string; entity: string; detail: string
          }>).map(e => ({ ts: e.ts, user: e.user_name, vertical: e.vertical, section: e.section as LogEntry["section"], action: e.action as LogEntry["action"], entity: e.entity, detail: e.detail }))
          setLog(entries); persistLog(entries)
        }
      } finally {
        setLoadingData(false)
      }
    }
    fetchAll()

    // Usuário logado
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user
      if (u) {
        setUserName(u.user_metadata?.full_name || u.email || "Usuário")
        setUserEmail(u.email || "")
      }
    })
  }, [])

  const addLog = useCallback((entries: Array<Omit<LogEntry, "ts" | "user">>) => {
    const now = new Date().toISOString()
    const newEntries: LogEntry[] = entries.map(e => ({ ...e, ts: now, user: userName }))
    setLog(prev => {
      const updated = [...newEntries, ...prev].slice(0, 500)
      persistLog(updated)
      return updated
    })
    // Persiste no Supabase (fire-and-forget)
    fetch("/api/sla-mql/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: entries.map(e => ({ ...e, user_name: userName, user_email: userEmail }))
      }),
    }).catch(() => {})
  }, [userName, userEmail])

  const visibleRows = rows.filter(r => r.vertical === vertical)
  const accentColor = VERTICAL_COLOR[vertical]
  const cols        = CONFIG[vertical]

  // ── Edição ───────────────────────────────────────────────────────────────────

  function makeFieldDraft(configOptions: string[], saved: string[]): FieldDraft {
    const configSet = new Set(configOptions)
    const extras = saved.filter(v => !configSet.has(v))
    return { options: [...configOptions, ...extras], accepted: new Set(saved) }
  }

  function startEdit(row: SlaRow) {
    const cfgCols = CONFIG[row.vertical] || []
    const get = (field: keyof Draft) =>
      cfgCols.find(c => c.field === field)?.options ?? []
    setEditingKey(`${row.table}:${row.id}`)
    setDraft({
      mql_intencoes:  makeFieldDraft(get("mql_intencoes"),  row.mql_intencoes),
      mql_faixas:     makeFieldDraft(get("mql_faixas"),     row.mql_faixas),
      mql_pagamentos: makeFieldDraft(get("mql_pagamentos"), row.mql_pagamentos),
    })
    setEditStatus(row.status)
    setSaveError(null)
    setAddingOption(null)
  }

  function cancelEdit() {
    setEditingKey(null)
    setDraft(null)
    setSaveError(null)
    setAddingOption(null)
  }

  function toggleOption(field: keyof Draft, value: string) {
    if (!draft) return
    const fd = draft[field]
    const next = new Set(fd.accepted)
    next.has(value) ? next.delete(value) : next.add(value)
    setDraft({ ...draft, [field]: { ...fd, accepted: next } })
  }

  function removeOption(field: keyof Draft, value: string) {
    if (!draft) return
    const fd = draft[field]
    const nextAccepted = new Set(fd.accepted)
    nextAccepted.delete(value)
    setDraft({ ...draft, [field]: { options: fd.options.filter(o => o !== value), accepted: nextAccepted } })
  }

  function addOption(field: keyof Draft, value: string) {
    if (!draft || !value.trim()) return
    const fd = draft[field]
    const v = value.trim()
    if (fd.options.includes(v)) { setAddingOption(null); return }
    setDraft({ ...draft, [field]: { options: [...fd.options, v], accepted: new Set([...fd.accepted, v]) } })
    setAddingOption(null)
  }

  async function saveEdit(row: SlaRow) {
    if (!draft) return
    setSaving(true)
    setSaveError(null)
    try {
      const newIntencoes  = Array.from(draft.mql_intencoes.accepted)
      const newFaixas     = Array.from(draft.mql_faixas.accepted)
      const newPagamentos = Array.from(draft.mql_pagamentos.accepted)

      const res = await fetch(`/api/sla-mql/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: editStatus, mql_intencoes: newIntencoes, mql_faixas: newFaixas, mql_pagamentos: newPagamentos }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "Erro ao salvar") }

      const updated = rows.map(r =>
        r.id === row.id ? { ...r, status: editStatus, mql_intencoes: newIntencoes, mql_faixas: newFaixas, mql_pagamentos: newPagamentos } : r
      )
      setRows(updated)
      persist(updated)

      // Monta entradas de log
      const logEntries: Array<Omit<LogEntry, "ts" | "user">> = []
      const fields: Array<[keyof Draft, string, string[]]> = [
        ["mql_intencoes",  CONFIG[row.vertical]?.[0]?.label ?? "Intenção",           row.mql_intencoes],
        ["mql_faixas",     CONFIG[row.vertical]?.[1]?.label ?? "Faixa",              row.mql_faixas],
        ["mql_pagamentos", CONFIG[row.vertical]?.[2]?.label ?? "Forma de Pagamento", row.mql_pagamentos],
      ]
      for (const [field, label, oldArr] of fields) {
        const oldSet = new Set(oldArr)
        const newSet = draft[field].accepted
        for (const opt of newSet) if (!oldSet.has(opt))
          logEntries.push({ vertical: row.vertical, section: "criterios", action: "add",    entity: row.nome, detail: `Adicionou em "${label}": ${opt}` })
        for (const opt of oldArr) if (!newSet.has(opt))
          logEntries.push({ vertical: row.vertical, section: "criterios", action: "remove", entity: row.nome, detail: `Removeu de "${label}": ${opt}` })
      }
      if (editStatus !== row.status)
        logEntries.push({ vertical: row.vertical, section: "criterios", action: "edit", entity: row.nome, detail: `Status: ${row.status ? "Ativo → Inativo" : "Inativo → Ativo"}` })
      if (logEntries.length > 0) addLog(logEntries)

      cancelEdit()
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function createRow() {
    if (!newName.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch("/api/sla-mql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vertical, nome: newName.trim() }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "Erro ao criar") }
      const { id } = await res.json()
      const newRow: SlaRow = {
        id,
        vertical,
        table: VERTICAL_TABLE[vertical],
        nome: newName.trim(),
        status: true,
        commercial_squad: "",
        mql_intencoes: [],
        mql_faixas: [],
        mql_pagamentos: [],
      }
      const updated = [...rows, newRow]
      setRows(updated)
      persist(updated)
      addLog([{ vertical, section: "criterios", action: "add", entity: newRow.nome, detail: `Adicionou empreendimento "${newRow.nome}"` }])
      setAddingNew(false)
      setNewName("")
      startEdit(newRow)
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function deleteRow(row: SlaRow) {
    const res = await fetch(`/api/sla-mql/${row.id}`, { method: "DELETE" })
    if (!res.ok) return
    const updated = rows.filter(r => r.id !== row.id)
    setRows(updated)
    persist(updated)
    addLog([{ vertical: row.vertical, section: "criterios", action: "remove", entity: row.nome, detail: `Removeu empreendimento "${row.nome}"` }])
    setConfirmDelete(null)
  }

  // ── Formulários CRUD ────────────────────────────────────────────────────────

  function syncForms(v: string, questions: Array<{ pergunta: string; opcoes: string[] }>) {
    fetch("/api/sla-mql/forms", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vertical: v, questions }),
    }).catch(() => {})
  }

  function startEditForm(vertical: string, qi: number) {
    const q = (forms[vertical] || [])[qi]
    if (!q) return
    setEditingForm({ vertical, qi })
    setFormDraft({ pergunta: q.pergunta, opcoes: [...q.opcoes] })
    setFormNewOpt("")
    setConfirmDelForm(null)
  }

  function cancelEditForm() {
    setEditingForm(null)
    setFormDraft(null)
    setFormNewOpt("")
  }

  function saveFormEdit() {
    if (!editingForm || !formDraft) return
    const { vertical: v, qi } = editingForm
    const oldQ = (forms[v] || [])[qi]
    const entity = `P${qi + 1} — ${(oldQ?.pergunta ?? "").slice(0, 50)}`

    // Detectar mudanças e logar
    const logEntries: Array<Omit<LogEntry, "ts" | "user">> = []
    if (oldQ && oldQ.pergunta !== formDraft.pergunta)
      logEntries.push({ vertical: v, section: "formularios", action: "edit", entity, detail: `Editou pergunta: "${oldQ.pergunta.slice(0, 60)}" → "${formDraft.pergunta.slice(0, 60)}"` })
    if (oldQ) {
      const oldSet = new Set(oldQ.opcoes)
      const newSet = new Set(formDraft.opcoes)
      for (const opt of formDraft.opcoes) if (!oldSet.has(opt))
        logEntries.push({ vertical: v, section: "formularios", action: "add",    entity, detail: `Adicionou opção: "${opt}"` })
      for (const opt of oldQ.opcoes) if (!newSet.has(opt))
        logEntries.push({ vertical: v, section: "formularios", action: "remove", entity, detail: `Removeu opção: "${opt}"` })
    }

    const updated = { ...forms, [v]: (forms[v] || []).map((q, i) =>
      i === qi ? { pergunta: formDraft.pergunta, opcoes: formDraft.opcoes } : q
    )}
    setForms(updated)
    persistForms(updated)
    syncForms(v, updated[v] || [])
    if (logEntries.length > 0) addLog(logEntries)
    cancelEditForm()
  }

  function addFormOption() {
    if (!formDraft || !formNewOpt.trim()) return
    const v = formNewOpt.trim()
    if (!formDraft.opcoes.includes(v)) {
      setFormDraft({ ...formDraft, opcoes: [...formDraft.opcoes, v] })
    }
    setFormNewOpt("")
  }

  function removeFormOption(opt: string) {
    if (!formDraft) return
    setFormDraft({ ...formDraft, opcoes: formDraft.opcoes.filter(o => o !== opt) })
  }

  function deleteFormQuestion(vertical: string, qi: number) {
    const oldQ = (forms[vertical] || [])[qi]
    const updated = { ...forms, [vertical]: (forms[vertical] || []).filter((_, i) => i !== qi) }
    setForms(updated)
    persistForms(updated)
    syncForms(vertical, updated[vertical] || [])
    if (oldQ) addLog([{ vertical, section: "formularios", action: "remove", entity: `P${qi + 1} — ${oldQ.pergunta.slice(0, 50)}`, detail: `Removeu pergunta: "${oldQ.pergunta.slice(0, 80)}"` }])
    setConfirmDelForm(null)
  }

  function moveFormQuestion(v: string, qi: number, dir: -1 | 1) {
    const qs = [...(forms[v] || [])]
    const to = qi + dir
    if (to < 0 || to >= qs.length) return
    const moved = qs[qi]
    ;[qs[qi], qs[to]] = [qs[to], qs[qi]]
    const updated = { ...forms, [v]: qs }
    setForms(updated)
    persistForms(updated)
    syncForms(v, qs)
    addLog([{ vertical: v, section: "formularios", action: "move", entity: `P${qi + 1} — ${moved.pergunta.slice(0, 50)}`, detail: `Moveu pergunta de P${qi + 1} para P${to + 1}` }])
  }

  function addFormQuestion(vertical: string) {
    if (!newFormQ.trim()) return
    const newQ: FormQuestion = { pergunta: newFormQ.trim(), opcoes: [] }
    const updated = { ...forms, [vertical]: [...(forms[vertical] || []), newQ] }
    setForms(updated)
    persistForms(updated)
    const qi = (updated[vertical] || []).length - 1
    syncForms(vertical, updated[vertical] || [])
    addLog([{ vertical, section: "formularios", action: "add", entity: `P${qi + 1} — ${newQ.pergunta.slice(0, 50)}`, detail: `Adicionou pergunta: "${newQ.pergunta.slice(0, 80)}"` }])
    setAddingFormQ(null)
    setNewFormQ("")
    startEditForm(vertical, qi)
  }

  // ── Estilos de tabela ────────────────────────────────────────────────────────

  const thStyle = (first?: boolean): React.CSSProperties => ({
    padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.08em", color: T.mutedFg,
    background: T.cinza50, borderBottom: `1px solid ${T.border}`,
    borderRight: `1px solid ${T.border}`, whiteSpace: "nowrap", fontFamily: T.font,
    ...(first ? { position: "sticky", left: 0, zIndex: 2, minWidth: 200, borderRight: `2px solid ${T.border}` } : {}),
  })

  const tdBase = (first?: boolean): React.CSSProperties => ({
    padding: "10px 14px", verticalAlign: "top",
    borderBottom: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
    ...(first ? { position: "sticky", left: 0, zIndex: 1, borderRight: `2px solid ${T.border}` } : {}),
  })

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font }}>

      {/* Topbar */}
      <header style={{
        background: "#0F172A", padding: "0 20px", height: 52,
        display: "flex", alignItems: "center", gap: 10,
        position: "sticky", top: 0, zIndex: 40,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", padding: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.12)" }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.01em", fontFamily: T.font }}>
          SLA de MQL
        </span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 400 }}>
          critérios por empreendimento
        </span>
        {loadingData && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: "spin 1s linear infinite" }}>
              <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 10"/>
            </svg>
            sincronizando…
          </span>
        )}
      </header>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 20px 80px" }}>

        {/* Page tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${T.border}` }}>
          {(["criterios", "formularios", "historico"] as const).map(tab => {
            const label = tab === "criterios" ? "Critérios" : tab === "formularios" ? "Formulários completos" : `Histórico${log.length > 0 ? ` (${log.length})` : ""}`
            const active = pageTab === tab
            return (
              <button
                key={tab}
                onClick={() => setPageTab(tab)}
                style={{
                  padding: "8px 16px", border: "none", background: "transparent",
                  fontFamily: T.font, fontSize: 13, cursor: "pointer",
                  fontWeight: active ? 700 : 400,
                  color: active ? T.fg : T.mutedFg,
                  borderBottom: active ? `2px solid ${T.fg}` : "2px solid transparent",
                  marginBottom: -1, transition: "color 0.15s",
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* ── Aba: Formulários completos ─────────────────────────────────────── */}
        {pageTab === "formularios" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            {(["SZI", "Marketplace", "Serviços"] as VerticalTab[]).map(v => {
              const color     = VERTICAL_COLOR[v]
              const questions = forms[v] || []
              const isAddingHere = addingFormQ === v

              return (
                <div key={v}>
                  {/* Vertical header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#fff", background: color, borderRadius: 5, padding: "3px 10px", fontFamily: T.font }}>
                      {v}
                    </span>
                    <span style={{ fontSize: 12.5, color: T.mutedFg, fontFamily: T.font }}>
                      {questions.length} pergunta{questions.length > 1 ? "s" : ""}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {questions.map((q, qi) => {
                      const fkey    = `${v}:${qi}`
                      const isEd    = editingForm?.vertical === v && editingForm?.qi === qi
                      const isDel   = confirmDelForm?.vertical === v && confirmDelForm?.qi === qi

                      return (
                        <div key={qi} style={{ background: T.card, borderTop: `1px solid ${isEd ? color : T.border}`, borderRight: `1px solid ${isEd ? color : T.border}`, borderBottom: `1px solid ${isEd ? color : T.border}`, borderLeft: `3px solid ${color}`, borderRadius: 10, padding: "14px 18px", boxShadow: T.elevSm, transition: "border-color 0.15s" }}>

                          {isEd && formDraft ? (
                            /* ── Modo edição ── */
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                              {/* Input da pergunta */}
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5, fontFamily: T.font }}>Pergunta</div>
                                <textarea
                                  value={formDraft.pergunta}
                                  onChange={e => setFormDraft({ ...formDraft, pergunta: e.target.value })}
                                  rows={2}
                                  style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: `1px solid ${color}`, fontFamily: T.font, fontSize: 13, color: T.fg, background: T.card, resize: "vertical", outline: "none", boxSizing: "border-box" }}
                                />
                              </div>

                              {/* Opções editáveis */}
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6, fontFamily: T.font }}>Opções</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                  {formDraft.opcoes.map((opt, oi) => (
                                    <span key={oi} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "3px 8px 3px 10px", borderRadius: 20, background: T.cinza50, border: `1px solid ${T.border}`, color: T.fg, fontFamily: T.font }}>
                                      {opt}
                                      <button onClick={() => removeFormOption(opt)} style={{ background: "none", border: "none", cursor: "pointer", color: T.mutedFg, fontSize: 13, padding: "0 0 0 2px", lineHeight: 1, opacity: 0.6 }}>×</button>
                                    </span>
                                  ))}
                                  {/* Input nova opção */}
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    <input
                                      type="text" placeholder="nova opção"
                                      value={formNewOpt}
                                      onChange={e => setFormNewOpt(e.target.value)}
                                      onKeyDown={e => { if (e.key === "Enter") addFormOption(); if (e.key === "Escape") setFormNewOpt("") }}
                                      style={{ fontSize: 11.5, padding: "3px 8px", borderRadius: 12, border: `1px dashed ${color}`, outline: "none", fontFamily: T.font, color: T.fg, background: T.card, width: 120 }}
                                    />
                                    <button onClick={addFormOption} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 10, border: "none", background: color, color: "#fff", cursor: "pointer", fontFamily: T.font }}>+</button>
                                  </span>
                                </div>
                              </div>

                              {/* Salvar / Cancelar */}
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={saveFormEdit} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: color, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Salvar</button>
                                <button onClick={cancelEditForm} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.mutedFg, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Cancelar</button>
                              </div>
                            </div>

                          ) : (
                            /* ── Modo visualização ── */
                            <>
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: color, background: `${color}12`, border: `1px solid ${color}25`, borderRadius: 20, padding: "1px 7px", fontFamily: T.font, flexShrink: 0 }}>
                                    P{qi + 1}
                                  </span>
                                  <span style={{ fontSize: 13.5, fontWeight: 600, color: T.fg, fontFamily: T.font, lineHeight: 1.4 }}>
                                    {q.pergunta}
                                  </span>
                                </div>

                                {/* Botões Editar / Remover / Ordenar */}
                                {isDel ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                    <span style={{ fontSize: 11.5, color: T.fg, fontFamily: T.font }}>Remover?</span>
                                    <button onClick={() => deleteFormQuestion(v, qi)} style={{ padding: "3px 10px", borderRadius: 5, border: "none", background: "#EF4444", color: "#fff", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>Sim</button>
                                    <button onClick={() => setConfirmDelForm(null)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.card, color: T.mutedFg, fontSize: 11.5, cursor: "pointer", fontFamily: T.font }}>Não</button>
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                                    {/* Mover cima/baixo */}
                                    <button
                                      onClick={() => moveFormQuestion(v, qi, -1)}
                                      disabled={qi === 0}
                                      title="Mover para cima"
                                      style={{ padding: "4px 7px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: qi === 0 ? T.cinza300 : T.mutedFg, fontSize: 12, cursor: qi === 0 ? "default" : "pointer", fontFamily: T.font, display: "flex", alignItems: "center", transition: "border-color 0.15s, color 0.15s", opacity: qi === 0 ? 0.4 : 1 }}
                                      onMouseEnter={e => { if (qi > 0) { (e.currentTarget as HTMLButtonElement).style.borderColor = color; (e.currentTarget as HTMLButtonElement).style.color = color } }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; (e.currentTarget as HTMLButtonElement).style.color = T.mutedFg }}
                                    >
                                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 7L5 3L8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </button>
                                    <button
                                      onClick={() => moveFormQuestion(v, qi, 1)}
                                      disabled={qi === (forms[v] || []).length - 1}
                                      title="Mover para baixo"
                                      style={{ padding: "4px 7px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: qi === (forms[v] || []).length - 1 ? T.cinza300 : T.mutedFg, fontSize: 12, cursor: qi === (forms[v] || []).length - 1 ? "default" : "pointer", fontFamily: T.font, display: "flex", alignItems: "center", transition: "border-color 0.15s, color 0.15s", opacity: qi === (forms[v] || []).length - 1 ? 0.4 : 1 }}
                                      onMouseEnter={e => { if (qi < (forms[v] || []).length - 1) { (e.currentTarget as HTMLButtonElement).style.borderColor = color; (e.currentTarget as HTMLButtonElement).style.color = color } }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; (e.currentTarget as HTMLButtonElement).style.color = T.mutedFg }}
                                    >
                                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3L5 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </button>
                                    <button
                                      onClick={() => startEditForm(v, qi)}
                                      style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.mutedFg, fontSize: 11.5, cursor: "pointer", fontFamily: T.font, display: "flex", alignItems: "center", gap: 4, transition: "border-color 0.15s, color 0.15s" }}
                                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = color; (e.currentTarget as HTMLButtonElement).style.color = color }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; (e.currentTarget as HTMLButtonElement).style.color = T.mutedFg }}
                                    >
                                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                      Editar
                                    </button>
                                    <button
                                      onClick={() => setConfirmDelForm({ vertical: v, qi })}
                                      style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.mutedFg, fontSize: 12, cursor: "pointer", fontFamily: T.font, display: "flex", alignItems: "center", transition: "border-color 0.15s, color 0.15s" }}
                                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#EF4444"; (e.currentTarget as HTMLButtonElement).style.color = "#EF4444" }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; (e.currentTarget as HTMLButtonElement).style.color = T.mutedFg }}
                                    >
                                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {q.opcoes.map((opt, oi) => (
                                  <span key={oi} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, background: T.cinza50, border: `1px solid ${T.border}`, color: T.mutedFg, fontFamily: T.font, display: "inline-flex", alignItems: "center", gap: 5 }}>
                                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0, opacity: 0.6 }} />
                                    {opt}
                                  </span>
                                ))}
                                {q.opcoes.length === 0 && <span style={{ fontSize: 12, color: T.cinza300, fontFamily: T.font, fontStyle: "italic" }}>Sem opções cadastradas</span>}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}

                    {/* + Adicionar pergunta */}
                    {!isAddingHere ? (
                      <button
                        onClick={() => { setAddingFormQ(v); setNewFormQ(""); cancelEditForm() }}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 8, border: `1px dashed ${T.border}`, background: "transparent", color: T.mutedFg, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: T.font, alignSelf: "flex-start", transition: "border-color 0.15s, color 0.15s" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = color; (e.currentTarget as HTMLButtonElement).style.color = color }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; (e.currentTarget as HTMLButtonElement).style.color = T.mutedFg }}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        Adicionar pergunta
                      </button>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <input
                          type="text" placeholder="Texto da pergunta" value={newFormQ} autoFocus
                          onChange={e => setNewFormQ(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") addFormQuestion(v); if (e.key === "Escape") { setAddingFormQ(null); setNewFormQ("") } }}
                          style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${color}`, fontSize: 13, fontFamily: T.font, color: T.fg, background: T.card, outline: "none", minWidth: 280 }}
                        />
                        <button onClick={() => addFormQuestion(v)} disabled={!newFormQ.trim()}
                          style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: color, color: "#fff", fontSize: 12, fontWeight: 600, cursor: !newFormQ.trim() ? "not-allowed" : "pointer", fontFamily: T.font, opacity: !newFormQ.trim() ? 0.6 : 1 }}>
                          Criar
                        </button>
                        <button onClick={() => { setAddingFormQ(null); setNewFormQ("") }}
                          style={{ padding: "7px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.mutedFg, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Aba: Histórico ────────────────────────────────────────────────── */}
        {pageTab === "historico" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {/* Cabeçalho */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.fg, fontFamily: T.font }}>{log.length} registro{log.length !== 1 ? "s" : ""}</div>
                <div style={{ fontSize: 12, color: T.mutedFg, fontFamily: T.font, marginTop: 2 }}>Todas as mudanças feitas neste navegador</div>
              </div>
              {log.length > 0 && (
                <button
                  onClick={() => { if (confirm("Limpar todo o histórico?")) { setLog([]); persistLog([]) } }}
                  style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.mutedFg, fontSize: 12, cursor: "pointer", fontFamily: T.font }}
                >
                  Limpar histórico
                </button>
              )}
            </div>

            {log.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: T.mutedFg, fontSize: 13, fontFamily: T.font }}>
                Nenhuma mudança registrada ainda.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                {log.map((entry, i) => {
                  const color = VERTICAL_COLOR[entry.vertical] || T.mutedFg
                  const actionColor = entry.action === "add" ? "#15803D" : entry.action === "remove" ? "#DC2626" : entry.action === "move" ? "#9333EA" : "#2563EB"
                  const actionBg    = entry.action === "add" ? "#DCFCE7" : entry.action === "remove" ? "#FEE2E2" : entry.action === "move" ? "#F3E8FF" : "#DBEAFE"
                  const actionLabel = entry.action === "add" ? "+ Adicionou" : entry.action === "remove" ? "− Removeu" : entry.action === "move" ? "↕ Moveu" : "✎ Editou"
                  const sectionLabel = entry.section === "criterios" ? "Critérios" : "Formulários"

                  const d = new Date(entry.ts)
                  const dateFmt = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                  const timeFmt = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

                  return (
                    <div key={i} style={{
                      display: "grid",
                      gridTemplateColumns: "140px 80px 80px 1fr auto",
                      alignItems: "start",
                      gap: 0,
                      padding: "12px 16px",
                      background: i % 2 === 0 ? T.card : T.cinza50,
                      borderBottom: i < log.length - 1 ? `1px solid ${T.border}` : "none",
                      fontFamily: T.font,
                    }}>
                      {/* Data + hora */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.fg }}>{dateFmt}</div>
                        <div style={{ fontSize: 11, color: T.mutedFg, marginTop: 1 }}>{timeFmt}</div>
                      </div>

                      {/* Vertical */}
                      <div style={{ paddingTop: 1 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", background: color, borderRadius: 4, padding: "2px 6px" }}>
                          {entry.vertical}
                        </span>
                      </div>

                      {/* Ação */}
                      <div style={{ paddingTop: 1 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: actionColor, background: actionBg, borderRadius: 4, padding: "2px 7px" }}>
                          {actionLabel}
                        </span>
                      </div>

                      {/* Detalhe */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.mutedFg, marginBottom: 2 }}>
                          {sectionLabel} — {entry.entity}
                        </div>
                        <div style={{ fontSize: 12.5, color: T.fg, lineHeight: 1.45 }}>
                          {entry.detail}
                        </div>
                      </div>

                      {/* Usuário */}
                      <div style={{ textAlign: "right", paddingTop: 1 }}>
                        <span style={{ fontSize: 11, color: T.mutedFg, whiteSpace: "nowrap" }}>{entry.user}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Aba: Critérios ─────────────────────────────────────────────────── */}
        {pageTab === "criterios" && (<>

        {/* Vertical tabs */}
        <div style={{
          display: "flex", gap: 6, marginBottom: 24, background: T.cinza50,
          borderRadius: 10, padding: 5, border: `1px solid ${T.border}`,
          width: "fit-content", boxShadow: T.elevSm,
        }}>
          {(["SZI", "Marketplace", "Serviços"] as VerticalTab[]).map(v => {
            const color  = VERTICAL_COLOR[v]
            const active = vertical === v
            const count  = rows.filter(r => r.vertical === v).length
            return (
              <button
                key={v}
                onClick={() => { setVertical(v); cancelEdit(); setAddingNew(false); setNewName(""); setConfirmDelete(null) }}
                style={{
                  padding: "7px 16px", borderRadius: 7, border: "none",
                  cursor: "pointer", fontFamily: T.font, fontSize: 13,
                  fontWeight: active ? 700 : 500, background: active ? color : "transparent",
                  color: active ? "#fff" : T.mutedFg, transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: 7,
                }}
              >
                {v}
                {count > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: active ? "rgba(255,255,255,0.25)" : T.cinza100,
                    color: active ? "#fff" : T.mutedFg,
                    borderRadius: 20, padding: "0 6px", lineHeight: "18px", fontFamily: T.font,
                  }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Legenda */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, fontSize: 11.5, color: T.mutedFg, fontFamily: T.font }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E" }} /> Ativo
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.cinza300 }} /> Inativo
          </div>
          <span style={{ width: 1, height: 14, background: T.border }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 7px", borderRadius: 20, background: "#DCFCE7", color: "#15803D", border: "1px solid #BBF7D0", fontSize: 10.5, fontWeight: 600 }}>
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5.5L4.2 7.5L8 3" stroke="#15803D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Passa
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 7px", borderRadius: 20, background: "#F1F5F9", color: "#CBD5E1", border: "1px solid #E2E8F0", fontSize: 10.5 }}>
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M3 3L7 7M7 3L3 7" stroke="#CBD5E1" strokeWidth="1.4" strokeLinecap="round"/></svg>
            Não passa
          </span>
          <span style={{ fontSize: 11.5, color: T.cinza300 }}>· Clique nos pills para editar quando no modo edição</span>
        </div>

        {/* Empty state */}
        {visibleRows.length === 0 && (
          <div style={{ padding: "48px 40px", textAlign: "center", color: T.mutedFg, background: T.cinza50, borderRadius: 14, border: `1px solid ${T.border}` }}>
            <p style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: T.fg }}>
              Nenhum empreendimento em {vertical}
            </p>
            <p style={{ margin: 0, fontSize: 12.5, color: T.mutedFg, lineHeight: 1.6 }}>
              Use "+ Adicionar empreendimento" abaixo para criar o primeiro.
            </p>
          </div>
        )}

        {/* Tabela */}
        {visibleRows.length > 0 && (
          <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${T.border}`, boxShadow: T.elevSm }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: T.card, fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle(true)}>{vertical === "SZI" ? "Empreendimento" : "Vertical"}</th>
                  {cols.map(c => (
                    <th key={c.field} style={thStyle()}>
                      <span style={{ color: accentColor }}>{c.label}</span>
                    </th>
                  ))}
                  <th style={{ ...thStyle(), minWidth: 130 }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => {
                  const key       = `${row.table}:${row.id}`
                  const isEditing = editingKey === key
                  const rowBg     = i % 2 === 0 ? T.card : T.cinza50
                  const squad     = (row.commercial_squad || "").replace("_", "-").toUpperCase()
                  const curStatus = isEditing ? editStatus : row.status

                  return (
                    <tr key={key} style={{ background: rowBg }}>

                      {/* Nome + status */}
                      <td style={{ ...tdBase(true), background: rowBg }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          {/* Bullet clicável em edição para toggle ativo/inativo */}
                          <button
                            onClick={isEditing ? () => setEditStatus(s => !s) : undefined}
                            title={isEditing ? (curStatus ? "Clique para marcar Inativo" : "Clique para marcar Ativo") : undefined}
                            style={{
                              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                              background: curStatus ? "#22C55E" : T.cinza300,
                              border: "none", padding: 0,
                              cursor: isEditing ? "pointer" : "default",
                              transition: "background 0.15s",
                              outline: isEditing ? `2px solid ${curStatus ? "#86EFAC" : T.cinza200}` : "none",
                              outlineOffset: 1,
                            }}
                          />
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: T.fg, fontFamily: T.font, letterSpacing: "-0.01em" }}>
                            {row.nome}
                          </span>
                          {squad && (
                            <span style={{
                              fontSize: 9, fontWeight: 600, color: accentColor,
                              background: `${accentColor}12`, border: `1px solid ${accentColor}20`,
                              borderRadius: 4, padding: "1px 5px", fontFamily: T.font,
                              letterSpacing: "0.03em", flexShrink: 0,
                            }}>
                              {squad}
                            </span>
                          )}
                          {isEditing && (
                            <span style={{
                              fontSize: 10, color: curStatus ? "#15803D" : T.mutedFg,
                              background: curStatus ? "#DCFCE7" : T.cinza100,
                              border: `1px solid ${curStatus ? "#BBF7D0" : T.border}`,
                              borderRadius: 4, padding: "1px 6px", fontFamily: T.font,
                              fontWeight: 600, flexShrink: 0,
                            }}>
                              {curStatus ? "Ativo" : "Inativo"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Colunas de critérios */}
                      {cols.map(c => {
                        const fd          = isEditing && draft ? draft[c.field] : null
                        const configSet   = new Set(c.options)
                        const extras      = row[c.field].filter(v => !configSet.has(v))
                        const allOpts     = fd ? fd.options : [...c.options, ...extras]
                        const acceptedSet = fd ? fd.accepted : new Set(row[c.field])
                        const isAddingThis = addingOption?.field === c.field

                        return (
                          <td key={c.field} style={tdBase()}>
                            {isEditing && (
                              <div style={{ fontSize: 10, color: accentColor, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5, opacity: 0.7 }}>
                                {c.label}
                              </div>
                            )}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                              {allOpts.map(opt => (
                                <Pill
                                  key={opt} label={opt}
                                  accepted={acceptedSet.has(opt)}
                                  editing={isEditing}
                                  onToggle={() => toggleOption(c.field, opt)}
                                  onRemove={isEditing ? () => removeOption(c.field, opt) : undefined}
                                />
                              ))}

                              {/* + por coluna em edição */}
                              {isEditing && !isAddingThis && (
                                <button
                                  onClick={() => setAddingOption({ field: c.field, value: "" })}
                                  title="Adicionar opção"
                                  style={{
                                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    width: 22, height: 22, borderRadius: "50%",
                                    border: `1.5px dashed ${accentColor}`, background: "transparent",
                                    color: accentColor, cursor: "pointer", fontSize: 14, lineHeight: 1,
                                    opacity: 0.6, transition: "opacity 0.15s",
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                                  onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
                                >+</button>
                              )}

                              {isEditing && isAddingThis && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <input
                                    autoFocus type="text" placeholder="nova opção"
                                    value={addingOption.value}
                                    onChange={e => setAddingOption({ field: c.field, value: e.target.value })}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") addOption(c.field, addingOption.value)
                                      if (e.key === "Escape") setAddingOption(null)
                                    }}
                                    style={{
                                      fontSize: 11.5, padding: "2px 7px", borderRadius: 12,
                                      border: `1px solid ${accentColor}`, outline: "none",
                                      fontFamily: T.font, color: T.fg, background: T.card, width: 130,
                                    }}
                                  />
                                  <button onClick={() => addOption(c.field, addingOption.value)}
                                    style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, border: "none", background: accentColor, color: "#fff", cursor: "pointer", fontFamily: T.font }}
                                  >OK</button>
                                  <button onClick={() => setAddingOption(null)}
                                    style={{ fontSize: 11, padding: "2px 6px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.card, color: T.mutedFg, cursor: "pointer", fontFamily: T.font }}
                                  >×</button>
                                </span>
                              )}
                            </div>
                          </td>
                        )
                      })}

                      {/* Ação */}
                      <td style={tdBase()}>
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {saveError && <span style={{ fontSize: 11, color: T.destructive, lineHeight: 1.4 }}>{saveError}</span>}
                            <button onClick={() => saveEdit(row)} disabled={saving}
                              style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: accentColor, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>
                              {saving ? "Salvando…" : "Salvar"}
                            </button>
                            <button onClick={cancelEdit} disabled={saving}
                              style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.mutedFg, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: T.font }}>
                              Cancelar
                            </button>
                          </div>
                        ) : confirmDelete === key ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            <span style={{ fontSize: 11, color: T.fg, fontWeight: 500, fontFamily: T.font }}>Remover?</span>
                            <div style={{ display: "flex", gap: 5 }}>
                              <button onClick={() => deleteRow(row)}
                                style={{ padding: "4px 10px", borderRadius: 5, border: "none", background: "#EF4444", color: "#fff", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>
                                Sim
                              </button>
                              <button onClick={() => setConfirmDelete(null)}
                                style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.card, color: T.mutedFg, fontSize: 11.5, cursor: "pointer", fontFamily: T.font }}>
                                Não
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 5 }}>
                            <button
                              onClick={() => startEdit(row)}
                              style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.mutedFg, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: T.font, display: "flex", alignItems: "center", gap: 4, transition: "border-color 0.15s, color 0.15s" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = accentColor; (e.currentTarget as HTMLButtonElement).style.color = accentColor }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; (e.currentTarget as HTMLButtonElement).style.color = T.mutedFg }}
                            >
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              Editar
                            </button>
                            <button
                              onClick={() => setConfirmDelete(key)} title="Remover"
                              style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.mutedFg, fontSize: 12, cursor: "pointer", fontFamily: T.font, display: "flex", alignItems: "center", transition: "border-color 0.15s, color 0.15s" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#EF4444"; (e.currentTarget as HTMLButtonElement).style.color = "#EF4444" }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; (e.currentTarget as HTMLButtonElement).style.color = T.mutedFg }}
                            >
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          </div>
                        )}
                      </td>

                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer: contagem + adicionar */}
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 16 }}>
          {visibleRows.length > 0 && (
            <span style={{ fontSize: 11.5, color: T.cinza300, fontFamily: T.font }}>
              {visibleRows.length} empreendimento{visibleRows.length > 1 ? "s" : ""} · {vertical}
            </span>
          )}

          {!addingNew ? (
            <button
              onClick={() => setAddingNew(true)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: `1px dashed ${T.border}`, background: "transparent", color: T.mutedFg, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: T.font, transition: "border-color 0.15s, color 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = accentColor; (e.currentTarget as HTMLButtonElement).style.color = accentColor }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; (e.currentTarget as HTMLButtonElement).style.color = T.mutedFg }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Adicionar empreendimento
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <input
                type="text" placeholder="Nome do empreendimento"
                value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                onKeyDown={e => { if (e.key === "Enter") createRow(); if (e.key === "Escape") { setAddingNew(false); setNewName("") } }}
                style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${accentColor}`, fontSize: 13, fontFamily: T.font, color: T.fg, background: T.card, outline: "none", minWidth: 220 }}
              />
              <button onClick={createRow} disabled={!newName.trim()}
                style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: accentColor, color: "#fff", fontSize: 12, fontWeight: 600, cursor: !newName.trim() ? "not-allowed" : "pointer", fontFamily: T.font, opacity: !newName.trim() ? 0.6 : 1 }}>
                Criar
              </button>
              <button onClick={() => { setAddingNew(false); setNewName("") }}
                style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.mutedFg, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>
                Cancelar
              </button>
            </div>
          )}
        </div>

        </>)}

      </main>
    </div>
  )
}
