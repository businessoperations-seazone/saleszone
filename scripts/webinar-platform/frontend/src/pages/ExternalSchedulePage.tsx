import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar";
import TimeSlots from "../components/TimeSlots";
import type { Session, Closer } from "../lib/types";
import { api } from "../lib/api";

const WEEKDAYS_PT = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado",
];

function getNowPill(): string {
  const now = new Date();
  const weekday = WEEKDAYS_PT[now.getDay()];
  const hour = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `Hoje é ${weekday}, ${hour}:${min}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} às ${time}`;
}

type Step = "form" | "calendar" | "confirm" | "confirmed";

interface LeadInfo {
  name: string;
  email: string;
  phone: string;
  cidade: string;
}

export default function ExternalSchedulePage() {
  const { closerSlug } = useParams<{ closerSlug: string }>();
  const navigate = useNavigate();
  const [closer, setCloser] = useState<Closer | null>(null);
  const [closerError, setCloserError] = useState(false);
  const [step, setStep] = useState<Step>("form");

  // Form state
  const [lead, setLead] = useState<LeadInfo>({ name: "", email: "", phone: "", cidade: "" });
  const [formError, setFormError] = useState<string | null>(null);

  // Calendar state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Confirm state
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [roomUrl, setRoomUrl] = useState<string>("");

  const [nowPill] = useState(getNowPill);

  useEffect(() => {
    if (!closerSlug) {
      navigate("/webinar/invalid");
      return;
    }
    api.getCloserBySlug(closerSlug)
      .then(setCloser)
      .catch(() => setCloserError(true));
  }, [closerSlug, navigate]);

  useEffect(() => {
    if (!selectedDate || !closerSlug) return;
    setLoadingSessions(true);
    setSessions([]);
    api.getAvailableSessions(selectedDate, closerSlug)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));
  }, [selectedDate, closerSlug]);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!lead.name.trim() || !lead.email.trim() || !lead.phone.trim() || !lead.cidade.trim()) {
      setFormError("Preencha todos os campos.");
      return;
    }
    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email.trim());
    if (!emailOk) {
      setFormError("Email inválido.");
      return;
    }
    setStep("calendar");
  }

  function handleSelectSession(session: Session) {
    setSelectedSession(session);
    setStep("confirm");
  }

  async function handleConfirm() {
    if (!selectedSession || !closerSlug) return;
    setConfirmError(null);
    setConfirmLoading(true);
    try {
      const result = await api.registerExternal({
        session_id: selectedSession.id,
        name: lead.name.trim(),
        email: lead.email.trim(),
        phone: lead.phone.trim(),
        cidade: lead.cidade.trim(),
        closer_slug: closerSlug,
      });
      if (result.already_registered) {
        setRoomUrl(result.room_url || `/webinar/sala/${selectedSession.id}`);
        setStep("confirmed");
        return;
      }
      if (result.has_existing) {
        setConfirmError("Você já possui um agendamento ativo com este email. Entre em contato com o time Seazone para reagendar.");
        return;
      }
      setRoomUrl(result.room_url || `/webinar/sala/${selectedSession.id}`);
      setStep("confirmed");
    } catch (err: unknown) {
      setConfirmError(err instanceof Error ? err.message : "Erro ao confirmar. Tente novamente.");
    } finally {
      setConfirmLoading(false);
    }
  }

  if (closerError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Página não encontrada</h2>
          <p className="text-gray-500 text-sm">O link que você acessou não é válido ou foi desativado.</p>
        </div>
      </div>
    );
  }

  if (!closer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 flex flex-col">
      {/* Header */}
      <header className="w-full py-5 px-6 flex items-center justify-center border-b border-blue-100/60 bg-white/70 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0066CC] flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight" style={{ color: "#0066CC", letterSpacing: "-0.02em" }}>Seazone</span>
        </div>
      </header>

      <div className="flex-1 py-10 px-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <div className="inline-block bg-white border border-blue-100 rounded-full px-4 py-1.5 text-xs text-blue-500 mb-4 shadow-sm font-medium">{nowPill}</div>
            <h1 className="text-2xl font-bold text-gray-900">Agende com {closer.name}</h1>
            <p className="text-gray-500 text-sm mt-1">Escolha um horário disponível para participar</p>
          </div>

          {/* Step: Form */}
          {step === "form" && (
            <form onSubmit={handleFormSubmit} className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Seus dados</h2>
                <p className="text-sm text-gray-500 mb-4">Preencha as informações abaixo para continuar</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome completo</label>
                <input
                  type="text"
                  value={lead.name}
                  onChange={(e) => setLead((l) => ({ ...l, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                  placeholder="João da Silva"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={lead.email}
                  onChange={(e) => setLead((l) => ({ ...l, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                  placeholder="voce@email.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefone / WhatsApp</label>
                <input
                  type="tel"
                  value={lead.phone}
                  onChange={(e) => setLead((l) => ({ ...l, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                  placeholder="(48) 99999-9999"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Cidade onde possui imóvel</label>
                <input
                  type="text"
                  value={lead.cidade}
                  onChange={(e) => setLead((l) => ({ ...l, cidade: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                  placeholder="Florianópolis / SC"
                  required
                />
              </div>

              {formError && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{formError}</p>}

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-[#0066CC] text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Continuar para o calendário
              </button>
            </form>
          )}

          {/* Step: Calendar */}
          {step === "calendar" && (
            <>
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-green-800 truncate">{lead.name}</p>
                    <p className="text-xs text-green-600 truncate">{lead.cidade}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setStep("form"); setSelectedSession(null); setSelectedDate(null); }}
                  className="text-xs text-green-700 underline underline-offset-2 hover:text-green-900 flex-shrink-0"
                >
                  alterar
                </button>
              </div>

              <Calendar
                selectedDate={selectedDate}
                onSelectDate={(date) => { setSelectedDate(date); setSelectedSession(null); }}
              />

              {selectedDate && (
                <div className="mt-4 bg-white rounded-2xl shadow p-4">
                  {loadingSessions ? (
                    <p className="text-center text-sm text-gray-400 py-4">Buscando horários...</p>
                  ) : (
                    <TimeSlots sessions={sessions} selectedDate={selectedDate} onSelect={handleSelectSession} />
                  )}
                </div>
              )}
            </>
          )}

          {/* Step: Confirm */}
          {step === "confirm" && selectedSession && (
            <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Confirmar agendamento</h2>
                <p className="text-sm text-gray-500">Verifique os dados antes de confirmar</p>
              </div>

              <div className="bg-blue-50 rounded-xl px-4 py-3">
                <p className="text-xs text-blue-500 uppercase font-semibold tracking-wide mb-1">Horário selecionado</p>
                <p className="text-sm font-semibold text-blue-900">{formatDateTime(selectedSession.starts_at)}</p>
                <button onClick={() => setStep("calendar")} className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800 mt-1">
                  alterar horário
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Seus dados</p>
                <div>
                  <p className="text-xs text-gray-400">Nome</p>
                  <p className="text-sm text-gray-800">{lead.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">E-mail</p>
                  <p className="text-sm text-gray-800">{lead.email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Telefone</p>
                  <p className="text-sm text-gray-800">{lead.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Cidade do imóvel</p>
                  <p className="text-sm text-gray-800">{lead.cidade}</p>
                </div>
              </div>

              {confirmError && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{confirmError}</p>}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("calendar")}
                  disabled={confirmLoading}
                  className="flex-1 py-3 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={confirmLoading}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#0066CC] text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {confirmLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Aguarde...
                    </>
                  ) : (
                    "Confirmar agendamento"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step: Confirmed */}
          {step === "confirmed" && (
            <div className="bg-white rounded-2xl shadow p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Inscrição confirmada!</h2>
              <p className="text-gray-500 text-sm mb-6">
                Você receberá um e-mail com os detalhes. Acesse a sala de espera no horário agendado.
              </p>
              <a
                href={roomUrl}
                className="inline-block bg-[#0066CC] text-white font-semibold py-3 px-6 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Acessar sala de espera
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full py-6 px-6 border-t border-blue-100/60 bg-white/60 backdrop-blur-sm">
        <div className="max-w-md mx-auto text-center space-y-2">
          <p className="text-sm text-gray-500">
            Conheça mais em{" "}
            <a href="https://seazone.com.br" target="_blank" rel="noopener noreferrer" className="text-[#0066CC] font-medium hover:underline">
              seazone.com.br
            </a>
          </p>
          <p className="text-xs text-gray-400">
            Siga no Instagram:{" "}
            <a href="https://instagram.com/destinoseazone" target="_blank" rel="noopener noreferrer" className="text-[#0066CC] hover:underline">@destinoseazone</a>
            {" "}e{" "}
            <a href="https://instagram.com/monicamedeiross" target="_blank" rel="noopener noreferrer" className="text-[#0066CC] hover:underline">@monicamedeiross</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
