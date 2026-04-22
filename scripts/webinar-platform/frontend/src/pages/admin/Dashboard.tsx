import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../lib/api";

interface AdminContext {
  token: string;
}

interface DashboardData {
  sessions_today: number;
  live_now: number;
  total_registered: number;
  total_attended: number;
  total_converted: number;
  conversion_rate: number;
}

interface StatCardProps {
  label: string;
  value: string | number;
  color: string;
}

function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const { token } = useOutletContext<AdminContext>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.admin.getDashboard(token)
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Dashboard</h2>

      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          Erro ao carregar dashboard: {error}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Sessões hoje" value={data.sessions_today ?? 0} color="text-gray-900" />
          <StatCard label="Ao vivo agora" value={data.live_now ?? 0} color="text-green-600" />
          <StatCard label="Inscritos" value={data.total_registered ?? 0} color="text-blue-600" />
          <StatCard label="Presentes" value={data.total_attended ?? 0} color="text-indigo-600" />
          <StatCard label="Convertidos" value={data.total_converted ?? 0} color="text-purple-600" />
          <StatCard
            label="Taxa de conversão"
            value={`${((data.conversion_rate ?? 0) * 100).toFixed(1)}%`}
            color="text-orange-600"
          />
        </div>
      )}
    </div>
  );
}
