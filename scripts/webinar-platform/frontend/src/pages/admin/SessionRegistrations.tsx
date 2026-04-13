import { useState, useEffect, useCallback } from "react";
import { useParams, useOutletContext, Link } from "react-router-dom";
import { api } from "../../lib/api";

interface AdminContext {
  token: string;
}

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

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendada",
  live: "Ao vivo",
  ended: "Encerrada",
  cancelled: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
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

function regStatus(reg: Registration): string {
  if (reg.cancelled_at) return "Cancelado";
  if (reg.attended_at) return "Presente";
  return "Inscrito";
}

function regStatusColor(reg: Registration): string {
  if (reg.cancelled_at) return "bg-red-50 text-red-700";
  if (reg.attended_at) return "bg-green-50 text-green-700";
  return "bg-blue-50 text-blue-700";
}

export default function SessionRegistrations() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { token } = useOutletContext<AdminContext>();
  const [data, setData] = useState<DetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.admin.getSessionDetails(token, sessionId);
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar inscritos");
    } finally {
      setLoading(false);
    }
  }, [sessionId, token]);

  useEffect(() => {
    load();
  }, [load]);

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

  const { session, stats, registrations } = data;

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
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[session.status] ?? "bg-gray-100 text-gray-700"}`}>
              {STATUS_LABELS[session.status] ?? session.status}
            </span>
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-0.5 uppercase tracking-wide font-medium">Inscritos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.confirmed}</p>
          <p className="text-xs text-gray-500 mt-0.5 uppercase tracking-wide font-medium">Confirmados</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.attended}</p>
          <p className="text-xs text-gray-500 mt-0.5 uppercase tracking-wide font-medium">Presentes</p>
        </div>
      </div>

      {/* Table */}
      {registrations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          Nenhuma inscrição encontrada para esta sessão.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Telefone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Deal Pipedrive</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Inscrito em</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {registrations.map((reg) => (
                  <tr key={reg.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{reg.name}</td>
                    <td className="px-4 py-3 text-gray-600">{reg.email}</td>
                    <td className="px-4 py-3 text-gray-600">{reg.phone}</td>
                    <td className="px-4 py-3">
                      {reg.pipedrive_deal_url ? (
                        <a
                          href={reg.pipedrive_deal_url}
                          target="_blank"
                          rel="noopener noreferrer"
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
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDateTime(reg.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${regStatusColor(reg)}`}>
                        {regStatus(reg)}
                      </span>
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
