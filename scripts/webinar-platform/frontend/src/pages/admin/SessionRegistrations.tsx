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
  created_at: string;
  cancelled_at: string | null;
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

type RegStatus = "Confirmado" | "Presente" | "Convertido" | "Cancelado";

function getRegStatus(reg: Registration): RegStatus {
  if (reg.cancelled_at) return "Cancelado";
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
        const order: Record<RegStatus, number> = { Cancelado: 4, Confirmado: 3, Presente: 2, Convertido: 1 };
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
          <p className="text-xs text-gray-500 mt-0.5 font-medium">Inscritos</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{activeRegs.length}</p>
          <p className="text-xs text-blue-500 mt-0.5 font-medium">Confirmados</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{presentCount}</p>
          <p className="text-xs text-green-500 mt-0.5 font-medium">Presentes</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{convertedCount}</p>
          <p className="text-xs text-amber-500 mt-0.5 font-medium">Convertidos</p>
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
                        <StatusBadge reg={reg} />
                      </td>
                    </tr>
                    {/* Expanded row */}
                    {expandedRow === reg.id && (
                      <tr key={`${reg.id}-expanded`} className="bg-blue-50/50">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
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
