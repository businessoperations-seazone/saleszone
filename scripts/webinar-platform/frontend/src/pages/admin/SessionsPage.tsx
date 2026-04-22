import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { Session, Closer } from "../../lib/types";
import { api } from "../../lib/api";

const STATUS_LABELS: Record<Session["status"], string> = {
  scheduled: "Agendada",
  live: "Ao vivo",
  ended: "Encerrada",
  cancelled: "Cancelada",
};

const STATUS_COLORS: Record<Session["status"], string> = {
  scheduled: "bg-gray-100 text-gray-700",
  live: "bg-green-100 text-green-700",
  ended: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
};

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [closers, setClosers] = useState<Closer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState(todayStr);
  const [filterDateTo, setFilterDateTo] = useState(todayStr);
  const [filterCloserId, setFilterCloserId] = useState("");

  async function fetchSessions(dateFrom: string, dateTo: string, status: string, closerId: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (closerId) params.set("closer_id", closerId);
      const data = await api.admin.getSessions(params.toString());
      setSessions(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar sessões");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.admin.getClosers()
      .then(setClosers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSessions(todayStr, todayStr, "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCancel(id: string) {
    const reason = prompt("Motivo do cancelamento (opcional):");
    if (reason === null) return; // user pressed Cancel on prompt
    try {
      const updated = await api.admin.updateSessionStatus(id, "cancelled", reason || undefined);
      setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao cancelar sessão");
    }
  }

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const closerMap = new Map(closers.map((c) => [c.id, c]));

  function handleFilter() {
    fetchSessions(filterDateFrom, filterDateTo, filterStatus, filterCloserId);
  }

  function getWaitingRoomUrl(sessionId: string) {
    return `${window.location.origin}/webinar/sala/${sessionId}`;
  }

  function handleCopyLink(sessionId: string) {
    navigator.clipboard.writeText(getWaitingRoomUrl(sessionId)).then(() => {
      setCopiedId(sessionId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Sessões</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-semibold underline">Fechar</button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Data início</label>
          <input
            type="date"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Data fim</label>
          <input
            type="date"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="scheduled">Agendada</option>
            <option value="live">Ao vivo</option>
            <option value="ended">Encerrada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>
        {closers.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Closer</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={filterCloserId}
              onChange={(e) => setFilterCloserId(e.target.value)}
            >
              <option value="">Todos</option>
              {closers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          onClick={handleFilter}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Filtrar
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          Nenhuma sessão encontrada.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Horário</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Closer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Inscritos</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sala de Espera</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessions.map((session) => {
                const closer = session.closer_id ? closerMap.get(session.closer_id) : null;
                return (
                  <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{formatDate(session.date)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatTime(session.starts_at)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{closer ? closer.name : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[session.status]}`}>
                        {STATUS_LABELS[session.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {session.registration_count ?? 0}
                      {session.max_participants ? ` / ${session.max_participants}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(session.id)}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 font-medium transition-colors"
                        title={getWaitingRoomUrl(session.id)}
                      >
                        {copiedId === session.id ? (
                          <>
                            <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-green-600">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                            Copiar link
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <Link
                          to={`/admin/sessoes/${session.id}/inscritos`}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Ver inscritos
                        </Link>
                        <Link
                          to={`/admin/sessoes/${session.id}/live`}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Ao vivo
                        </Link>
                        {session.status === "scheduled" && (
                          <button
                            onClick={() => handleCancel(session.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
