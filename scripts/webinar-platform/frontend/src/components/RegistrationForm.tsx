import { useState } from "react";
import type { Session } from "../lib/types";
import { api } from "../lib/api";

interface RegistrationFormProps {
  session: Session;
  onSuccess: (roomUrl: string) => void;
  onBack: () => void;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} às ${time}`;
}

export default function RegistrationForm({ session, onSuccess, onBack }: RegistrationFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await api.register({
        session_id: session.id,
        name,
        email,
        phone,
      });
      // API returns { access_token, room_url } or similar
      const roomUrl = result?.room_url || `/webinar/sala/${session.id}`;
      onSuccess(roomUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao realizar inscrição. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow p-6 w-full max-w-sm mx-auto">
      <div className="mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">
          Horário selecionado
        </p>
        <p className="text-sm font-medium text-gray-800">
          {formatDateTime(session.starts_at)}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="reg-name">
            Nome
          </label>
          <input
            id="reg-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome completo"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="reg-email">
            E-mail
          </label>
          <input
            id="reg-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="reg-phone">
            Telefone
          </label>
          <input
            id="reg-phone"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(48) 99999-9999"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
          />
        </div>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            className="flex-1 py-2 px-4 rounded-lg border border-gray-200 text-sm font-medium
              text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Voltar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2 px-4 rounded-lg bg-blue-500 text-white text-sm font-semibold
              hover:bg-blue-600 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Aguarde...
              </>
            ) : (
              "Confirmar agendamento"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
