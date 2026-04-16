import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../lib/api";

interface SessionInfo {
  id: string;
  date: string;
  starts_at: string;
  ends_at: string;
  status: string;
  google_meet_link: string | null;
  closer: { id: string; name: string; email: string; slug: string } | null;
}

interface Stats {
  total: number;
  confirmed: number;
  attended: number;
}

interface Registration {
  id: string;
  name: string;
  email: string;
  phone: string;
  pipedrive_deal_url: string | null;
  observacoes: string | null;
  cidade: string | null;
  tipo_imovel: string | null;
  is_opportunity: boolean | null;
  opportunity_marked_at: string | null;
  fireflies_transcript_id: string | null;
  transcript_summary: string | null;
  transcript_synced_at: string | null;
  pipedrive_transcript_note_id: number | null;
  created_at: string;
  cancelled_at: string | null;
  no_show_at: string | null;
  attended_at: string | null;
  converted: boolean;
}

interface DetailsData {
  session: SessionInfo;
  stats: Stats;
  registrations: Registration[];
}

const SESSION_STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendada",
  live: "Ao vivo",
  ended: "Encerrada",
  cancelled: "Cancelada",
};

const SESSION_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-gray-100 text-gray-700",
  live: "bg-green-100 text-green-700",
  ended: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
};

function formatDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type RegStatus = "Confirmado" | "Presente" | "Convertido" | "Cancelado" | "No Show";

function getRegStatus(reg: Registration): RegStatus {
  if (reg.cancelled_at) return "Cancelado";
  if (reg.no_show_at) return "No Show";
  if (reg.converted) return "Convertido";
  if (reg.attended_at) return "Presente";
  return "Confirmado";
}

function StatusBadge({ reg }: { reg: Registration }) {
  const status = getRegStatus(reg);
  const styles: Record<RegStatus, string> = {
    Confirmado: "bg-blue-100 text-blue-700 border border-blue-200",
    Presente: "bg-green-100 text-green-700 border border-green-200",
    Convertido: "bg-amber-100 text-amber-700 border border-amber-200",
    Cancelado: "bg-gray-100 text-gray-400 border border-gray-200 line-through",
    "No Show": "bg-red-100 text-red-700 border border-red-200",
  };
  const icons: Record<RegStatus, React.ReactElement> = {
    Confirmado: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    Presente: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
    Convertido: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    Cancelado: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    "No Show": (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    ),
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {icons[status]}
      {status}
    </span>
  );
}

type SortKey = "name" | "created_at" | "status";
type SortDir = "asc" | "desc";

export default function SessionRegistrations() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [data, setData] = useState<DetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editingObs, setEditingObs] = useState<Record<string, string>>({});
  const [savingObs, setSavingObs] = useState<string | null>(null);
  const [savingOpp, setSavingOpp] = useState<string | null>(null);
  const [syncingTranscript, setSyncingTranscript] = useState<string | null>(null);
  const [markingNoShow, setMarkingNoShow] = useState<string | null>(null);
  const [markingNoShows, setMarkingNoShows] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.admin.getSessionDetails(sessionId);
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar inscritos");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveObs(regId: string) {
    const obs = editingObs[regId] ?? "";
    setSavingObs(regId);
    try {
      await api.admin.updateRegistration(regId, { observacoes: obs });
      // Update local state
      setData((prev) => prev ? {
        ...prev,
        registrations: prev.registrations.map((r) => r.id === regId ? { ...r, observacoes: obs } : r),
      } : prev);
      setEditingObs((prev) => { const n = { ...prev }; delete n[regId]; return n; });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar observações");
    } finally {
      setSavingObs(null);
    }
  }

  async function handleSyncTranscript(regId: string) {
    setSyncingTranscript(regId);
    setError(null);
    try {
      const result = await api.admin.syncTranscript(regId);
      if (result.ok) {
        alert(`✅ Resumo da reunião "${result.transcript_title}" enviado para o Pipedrive (nota ${result.pipedrive?.note_id || "—"}).`);
        await load();
      } else {
        alert(`⚠️ ${result.error}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao sincronizar transcrição");
    } finally {
      setSyncingTranscript(null);
    }
  }

  async function handleSetOpportunity(regId: string, value: boolean) {
    setSavingOpp(regId);
    setError(null);
    try {
      const result = await api.admin.updateRegistration(regId, { is_opportunity: value }) as Registration & { _pipedrive?: { stage_move?: { ok: boolean; moved?: boolean; pipeline_id?: number; error?: string } } };
      setData((prev) => prev ? {
        ...prev,
        registrations: prev.registrations.map((r) => r.id === regId ? { ...r, is_opportunity: value, opportunity_marked_at: value ? new Date().toISOString() : r.opportunity_marked_at } : r),
      } : prev);
      // Show feedback about Pipedrive action
      const pd = result._pipedrive?.stage_move;
      if (value && pd) {
        if (pd.moved) {
          alert("✅ Deal movido para \"Reunião Realizada\" no Pipedrive.");
        } else if (pd.ok && !pd.moved) {
          alert(`ℹ️ Deal marcado como oportunidade, mas não foi movido (pipeline ${pd.pipeline_id}, esperado 14).`);
        } else if (!pd.ok) {
          alert(`⚠️ Marcado como oportunidade, mas erro no Pipedrive: ${pd.error}`);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao marcar oportunidade");
    } finally {
      setSavingOpp(null);
    }
  }

  async function handleMarkNoShow(regId: string) {
    if (!confirm("Marcar como Não Compareceu e mover o deal para No Show no Pipedrive?")) return;
    setMarkingNoShow(regId);
    setError(null);
    try {
      const result = await api.admin.updateRegistration(regId, { no_show_at: true }) as Registration & { _pipedrive?: { no_show_move?: { ok: boolean; moved?: boolean; pipeline_id?: number; error?: string } } };
      setData((prev) => prev ? {
        ...prev,
        registrations: prev.registrations.map((r) => r.id === regId ? { ...r, no_show_at: new Date().toISOString() } : r),
      } : prev);
      const pd = result._pipedrive?.no_show_move;
      if (pd?.moved) {
        alert("Deal movido para 'No Show' no Pipedrive.");
      } else if (pd && !pd.ok) {
        alert(`Marcado como No Show, mas erro no Pipedrive: ${pd.error}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao marcar No Show");
    } finally {
      setMarkingNoShow(null);
    }
  }

  async function handleMarkNoShows() {
    if (!sessionId) return;
    const confirmadoCount = data?.registrations.filter((r) => !r.attended_at && !r.cancelled_at && !r.no_show_at).length ?? 0;
    if (confirmadoCount === 0) {
      alert("Nenhum inscrito pendente para marcar como No Show.");
      return;
    }
    if (!confirm(`Marcar ${confirmadoCount} inscrito(s) como No Show e mover os deals para "No Show" no Pipedrive?`)) return;
    setMarkingNoShows(true);
    setError(null);
    try {
      const result = await api.admin.markNoShows(sessionId);
      const movedCount = result.results.filter((r) => r.pipedrive?.moved).length;
      const failedCount = result.results.filter((r) => r.pipedrive && !r.pipedrive.ok).length;
      let msg = `${result.marked} inscrito(s) marcados como No Show.`;
      if (movedCount > 0) msg += ` ${movedCount} deal(s) movidos no Pipedrive.`;
      if (failedCount > 0) msg += ` ${failedCount} erro(s) no Pipedrive.`;
      alert(msg);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao marcar No Shows");
    } finally {
      setMarkingNoShows(false);
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function getSortedRegistrations(regs: Registration[]) {
    return [...regs].sort((a, b) => {
      let valA: string | number = "";
      let valB: string | number = "";
      if (sortKey === "name") { valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); }
      if (sortKey === "created_at") { valA = a.created_at; valB = b.created_at; }
      if (sortKey === "status") {
        const order: Record<RegStatus, number> = { Cancelado: 5, "No Show": 4, Confirmado: 3, Presente: 2, Convertido: 1 };
        valA = order[getRegStatus(a)];
        valB = order[getRegStatus(b)];
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="opacity-30 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { session, registrations } = data;

  // Compute stats from registrations (more accurate than backend stats)
  const activeRegs = registrations.filter((r) => !r.cancelled_at);
  const totalCount = registrations.length;
  const presentCount = registrations.filter((r) => !!r.attended_at && !r.cancelled_at).length;
  const convertedCount = registrations.filter((r) => r.converted && !r.cancelled_at).length;
  const cancelledCount = registrations.filter((r) => !!r.cancelled_at).length;
  const noShowCount = registrations.filter((r) => !!r.no_show_at && !r.cancelled_at).length;
  const confirmadoCount = activeRegs.length - presentCount - convertedCount - noShowCount;

  const exportUrl = sessionId ? api.admin.exportCSV(sessionId) : null;

  const sorted = getSortedRegistrations(registrations);

  return (
    <div className="p-6">
      {/* Back link */}
      <Link
        to="/admin/sessoes"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Voltar para Sessões
      </Link>

      {/* Session info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1 capitalize">{formatDate(session.date)}</h2>
            <p className="text-sm text-gray-500">às {formatTime(session.starts_at)}</p>
            {session.closer && (
              <p className="text-sm text-gray-600 mt-1">
                Closer: <span className="font-medium text-gray-800">{session.closer.name}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${SESSION_STATUS_COLORS[session.status] ?? "bg-gray-100 text-gray-700"}`}>
              {SESSION_STATUS_LABELS[session.status] ?? session.status}
            </span>
            {exportUrl && (
              <a
                href={exportUrl}
                download
                className="flex items-center gap-1.5 bg-gray-100 text-gray-700 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-gray-200 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Exportar inscritos
              </a>
            )}
            {confirmadoCount > 0 && (session.status === "ended" || session.status === "cancelled") && (
              <button
                onClick={handleMarkNoShows}
                disabled={markingNoShows}
                className="flex items-center gap-1.5 bg-red-600 text-white rounded-lg px-3 py-2 text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                title={`Marcar ${confirmadoCount} inscrito(s) que não participaram como No Show`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                {markingNoShows ? "Marcando..." : `Marcar No Shows (${confirmadoCount})`}
              </button>
            )}
            <button
              onClick={load}
              className="flex items-center gap-1.5 bg-blue-600 text-white rounded-lg px-3 py-2 text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
          <p className="text-xs text-gray-500 mt-0.5 font-medium">Inscritos</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{presentCount}</p>
          <p className="text-xs text-green-500 mt-0.5 font-medium">Presentes</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{convertedCount}</p>
          <p className="text-xs text-amber-500 mt-0.5 font-medium">Convertidos</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{noShowCount}</p>
          <p className="text-xs text-red-500 mt-0.5 font-medium">No Show</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-400">{cancelledCount}</p>
          <p className="text-xs text-gray-400 mt-0.5 font-medium">Cancelados</p>
        </div>
      </div>

      {/* Presença section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Lista de presença
        </h3>
        <p className="text-sm text-gray-400 italic">
          Presenca detectada via Fireflies — em breve
        </p>
      </div>

      {/* Table */}
      {registrations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-400 text-sm font-medium">Ninguém se inscreveu ainda nesta sessão</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Summary line */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            <span>{totalCount} inscritos</span>
            <span className="text-gray-300">·</span>
            <span className="text-green-600 font-medium">{presentCount} presentes</span>
            <span className="text-gray-300">·</span>
            <span className="text-amber-600 font-medium">{convertedCount} convertidos</span>
            {noShowCount > 0 && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-red-600 font-medium">{noShowCount} no show</span>
              </>
            )}
            {cancelledCount > 0 && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-gray-400">{cancelledCount} cancelados</span>
              </>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 select-none"
                    onClick={() => handleSort("name")}
                  >
                    Nome <SortIcon col="name" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Contato
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                    Deal Pipedrive
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 select-none hidden md:table-cell"
                    onClick={() => handleSort("created_at")}
                  >
                    Inscrito em <SortIcon col="created_at" />
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 select-none"
                    onClick={() => handleSort("status")}
                  >
                    Status <SortIcon col="status" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((reg) => (
                  <>
                    <tr
                      key={reg.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setExpandedRow(expandedRow === reg.id ? null : reg.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-blue-600">
                              {reg.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-gray-900">{reg.name}</span>
                          {reg.is_opportunity === true && (
                            <span title="Oportunidade" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200">
                              🎯 OPP
                            </span>
                          )}
                          {reg.is_opportunity === false && (
                            <span title="Não é oportunidade" className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
                              não
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-gray-700 text-xs">{reg.email}</p>
                          <p className="text-gray-500 text-xs">{reg.phone}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {reg.pipedrive_deal_url ? (
                          <a
                            href={reg.pipedrive_deal_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium text-xs"
                          >
                            Ver deal
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">
                        {formatDateTime(reg.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge reg={reg} />
                          {getRegStatus(reg) === "Confirmado" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMarkNoShow(reg.id); }}
                              disabled={markingNoShow === reg.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Marcar como Não Compareceu (move deal para No Show no Pipedrive)"
                            >
                              {markingNoShow === reg.id ? "..." : "Não compareceu"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Expanded row */}
                    {expandedRow === reg.id && (
                      <tr key={`${reg.id}-expanded`} className="bg-blue-50/50">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-3">
                            <div>
                              <p className="text-gray-400 font-medium mb-1">Inscrito em</p>
                              <p className="text-gray-700">{formatDateTime(reg.created_at)}</p>
                            </div>
                            {reg.attended_at && (
                              <div>
                                <p className="text-gray-400 font-medium mb-1">Presente em</p>
                                <p className="text-green-700">{formatDateTime(reg.attended_at)}</p>
                              </div>
                            )}
                            {reg.no_show_at && (
                              <div>
                                <p className="text-gray-400 font-medium mb-1">No Show em</p>
                                <p className="text-red-600">{formatDateTime(reg.no_show_at)}</p>
                              </div>
                            )}
                            {reg.cancelled_at && (
                              <div>
                                <p className="text-gray-400 font-medium mb-1">Cancelado em</p>
                                <p className="text-red-600">{formatDateTime(reg.cancelled_at)}</p>
                              </div>
                            )}
                            {reg.pipedrive_deal_url && (
                              <div>
                                <p className="text-gray-400 font-medium mb-1">Deal Pipedrive</p>
                                <a
                                  href={reg.pipedrive_deal_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline break-all"
                                >
                                  {reg.pipedrive_deal_url}
                                </a>
                              </div>
                            )}
                          </div>
                          {/* Cidade + Tipo */}
                          <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-3" onClick={(e) => e.stopPropagation()}>
                            <div>
                              <p className="text-gray-400 font-medium mb-1 text-xs">Cidade do imóvel</p>
                              <input
                                type="text"
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                                placeholder="—"
                                defaultValue={reg.cidade ?? ""}
                                onBlur={async (e) => {
                                  const v = e.target.value.trim();
                                  if (v === (reg.cidade ?? "")) return;
                                  try {
                                    await api.admin.updateRegistration(reg.id, { cidade: v });
                                    setData((prev) => prev ? {
                                      ...prev,
                                      registrations: prev.registrations.map((r) => r.id === reg.id ? { ...r, cidade: v } : r),
                                    } : prev);
                                  } catch (err) {
                                    setError(err instanceof Error ? err.message : "Erro ao salvar cidade");
                                  }
                                }}
                              />
                            </div>
                            <div>
                              <p className="text-gray-400 font-medium mb-1 text-xs">Tipo do imóvel</p>
                              <select
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                                defaultValue={reg.tipo_imovel ?? ""}
                                onChange={async (e) => {
                                  const v = e.target.value;
                                  if (v === (reg.tipo_imovel ?? "")) return;
                                  try {
                                    await api.admin.updateRegistration(reg.id, { tipo_imovel: v });
                                    setData((prev) => prev ? {
                                      ...prev,
                                      registrations: prev.registrations.map((r) => r.id === reg.id ? { ...r, tipo_imovel: v } : r),
                                    } : prev);
                                  } catch (err) {
                                    setError(err instanceof Error ? err.message : "Erro ao salvar tipo");
                                  }
                                }}
                              >
                                <option value="">— selecionar —</option>
                                <option value="Apartamento">Apartamento</option>
                                <option value="Casa">Casa</option>
                                <option value="Cobertura">Cobertura</option>
                                <option value="Terreno">Terreno</option>
                                <option value="Comercial">Comercial</option>
                                <option value="Outro">Outro</option>
                              </select>
                            </div>
                          </div>

                          {/* Oportunidade selector */}
                          <div className="mb-3" onClick={(e) => e.stopPropagation()}>
                            <p className="text-gray-400 font-medium mb-1.5 text-xs">É oportunidade?</p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleSetOpportunity(reg.id, true)}
                                disabled={savingOpp === reg.id}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                                  reg.is_opportunity === true
                                    ? "bg-green-600 text-white shadow-sm"
                                    : "bg-white border border-gray-200 text-gray-700 hover:bg-green-50 hover:border-green-300"
                                }`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                Sim {reg.is_opportunity === true && "(move Pipedrive)"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetOpportunity(reg.id, false)}
                                disabled={savingOpp === reg.id}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                                  reg.is_opportunity === false
                                    ? "bg-gray-500 text-white shadow-sm"
                                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                                }`}
                              >
                                Não
                              </button>
                              {savingOpp === reg.id && (
                                <span className="text-gray-400 text-xs">Salvando...</span>
                              )}
                              {reg.is_opportunity === true && reg.opportunity_marked_at && (
                                <span className="text-xs text-green-700 ml-1">
                                  Marcada em {formatDateTime(reg.opportunity_marked_at)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Observações editor */}
                          <div onClick={(e) => e.stopPropagation()}>
                            <p className="text-gray-400 font-medium mb-1 text-xs">Observações <span className="font-normal text-gray-400">(ao salvar, vira nota no deal do Pipedrive)</span></p>
                            <textarea
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs resize-y min-h-[60px] bg-white"
                              placeholder="Anotações do closer (perfil, interesse, próximos passos...)"
                              value={editingObs[reg.id] ?? reg.observacoes ?? ""}
                              onChange={(e) => setEditingObs((p) => ({ ...p, [reg.id]: e.target.value }))}
                              rows={3}
                            />
                            {(editingObs[reg.id] !== undefined && editingObs[reg.id] !== (reg.observacoes ?? "")) && (
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => handleSaveObs(reg.id)}
                                  disabled={savingObs === reg.id}
                                  className="bg-blue-600 text-white rounded-md px-3 py-1 text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                                >
                                  {savingObs === reg.id ? "Salvando..." : "Salvar"}
                                </button>
                                <button
                                  onClick={() => setEditingObs((p) => { const n = { ...p }; delete n[reg.id]; return n; })}
                                  className="border border-gray-200 text-gray-600 rounded-md px-3 py-1 text-xs hover:bg-gray-50 transition-colors"
                                >
                                  Cancelar
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Transcript sync */}
                          <div className="mt-4 pt-3 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                            <p className="text-gray-400 font-medium mb-1 text-xs">Resumo da reunião (Fireflies → Pipedrive)</p>
                            {reg.transcript_synced_at ? (
                              <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-xs">
                                <p className="text-green-700 font-medium">
                                  ✅ Sincronizado em {formatDateTime(reg.transcript_synced_at)}
                                </p>
                                {reg.transcript_summary && (
                                  <p className="text-gray-600 mt-1 whitespace-pre-wrap line-clamp-3">{reg.transcript_summary.slice(0, 300)}...</p>
                                )}
                                <button
                                  onClick={() => handleSyncTranscript(reg.id)}
                                  disabled={syncingTranscript === reg.id}
                                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                                >
                                  {syncingTranscript === reg.id ? "Sincronizando..." : "↻ Sincronizar novamente"}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleSyncTranscript(reg.id)}
                                disabled={syncingTranscript === reg.id || !reg.attended_at}
                                className="inline-flex items-center gap-1.5 bg-purple-600 text-white rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={!reg.attended_at ? "Marque presença antes de buscar a transcrição" : "Busca a transcrição no Fireflies e envia o resumo como nota no Pipedrive"}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                                {syncingTranscript === reg.id ? "Buscando..." : "Buscar e enviar resumo ao Pipedrive"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
