import { useState, useEffect } from "react";
import type { Registration, Session } from "../../lib/types";
import { api } from "../../lib/api";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function RegistrationsPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSessionId, setFilterSessionId] = useState("");

  useEffect(() => {
    // Load sessions for filter dropdown
    api.admin.getSessions()
      .then(setSessions)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);

    const loadRegs = async () => {
      try {
        if (filterSessionId) {
          const data = await api.admin.getSessionRegistrations(filterSessionId);
          setRegistrations(data);
        } else {
          const data = await api.admin.getAllRegistrations();
          setRegistrations(data);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao carregar inscrições");
      } finally {
        setLoading(false);
      }
    };

    loadRegs();
  }, [filterSessionId]);

  function handleExportCSV() {
    const url = api.admin.exportCSV(filterSessionId || undefined);
    window.open(url, "_blank");
  }

  function getSessionLabel(sessionId: string): string {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return sessionId.slice(0, 8) + "...";
    const [y, m, d] = session.date.split("-");
    return `${d}/${m}/${y} ${new Date(session.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Inscrições</h2>
        <button
          onClick={handleExportCSV}
          className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Exportar CSV
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-semibold underline">Fechar</button>
        </div>
      )}

      {/* Filter by session */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Filtrar por sessão</label>
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[220px]"
            value={filterSessionId}
            onChange={(e) => setFilterSessionId(e.target.value)}
          >
            <option value="">Todas as sessões</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {getSessionLabel(s.id)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : registrations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          Nenhuma inscrição encontrada.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">
            {registrations.length} inscrição{registrations.length !== 1 ? "ões" : ""}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Telefone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Deal</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sessão</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Inscrito em</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Obs.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Presente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Convertido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {registrations.map((reg) => (
                  <tr key={reg.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{reg.name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{reg.email}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{reg.phone}</td>
                    <td className="px-4 py-3">
                      {reg.pipedrive_deal_url ? (
                        <a
                          href={reg.pipedrive_deal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          #{reg.pipedrive_deal_url.split("/").pop()}
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{getSessionLabel(reg.session_id)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(reg.created_at)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate" title={reg.observacoes || ""}>
                      {reg.observacoes ? reg.observacoes : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {reg.attended_at ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Sim · {formatDateTime(reg.attended_at)}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">Não</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {reg.converted ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          Sim
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">Não</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
