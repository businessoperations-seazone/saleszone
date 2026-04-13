import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar";
import TimeSlots from "../components/TimeSlots";
import RegistrationForm from "../components/RegistrationForm";
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

type Step = "calendar" | "form" | "confirmed";

export default function SchedulePage() {
  const { closerSlug } = useParams<{ closerSlug: string }>();
  const navigate = useNavigate();
  const [closer, setCloser] = useState<Closer | null>(null);
  const [closerError, setCloserError] = useState(false);
  const [step, setStep] = useState<Step>("calendar");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [roomUrl, setRoomUrl] = useState<string>("");
  const [nowPill] = useState(getNowPill);

  useEffect(() => {
    if (!closerSlug) {
      navigate("/webinar/invalid");
      return;
    }
    api.getCloserBySlug(closerSlug)
      .then((data) => setCloser(data))
      .catch(() => setCloserError(true));
  }, [closerSlug, navigate]);

  useEffect(() => {
    if (!selectedDate || !closerSlug) return;
    setLoadingSessions(true);
    setSessions([]);
    api
      .getAvailableSessions(selectedDate, closerSlug)
      .then((data) => setSessions(data))
      .catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));
  }, [selectedDate, closerSlug]);

  function handleSelectSession(session: Session) {
    setSelectedSession(session);
    setStep("form");
  }

  function handleRegistered(url: string) {
    setRoomUrl(url);
    setStep("confirmed");
  }

  function handleBack() {
    setSelectedSession(null);
    setStep("calendar");
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
      {/* Seazone Brand Header */}
      <header className="w-full py-5 px-6 flex items-center justify-center border-b border-blue-100/60 bg-white/70 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0066CC] flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <span
            className="text-xl font-bold tracking-tight"
            style={{ color: "#0066CC", letterSpacing: "-0.02em" }}
          >
            Seazone
          </span>
        </div>
      </header>

      <div className="flex-1 py-10 px-4">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-block bg-white border border-blue-100 rounded-full px-4 py-1.5 text-xs text-blue-500 mb-4 shadow-sm font-medium">
              {nowPill}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Agende com {closer.name}</h1>
            <p className="text-gray-500 text-sm mt-1">
              Escolha um horário disponível para participar
            </p>
          </div>

          {/* Step: Calendar */}
          {step === "calendar" && (
            <>
              {/* Hero section */}
              <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 mb-5">
                <p className="text-base font-semibold text-slate-800 mb-4">
                  Descubra como transformar seu imóvel em fonte de renda passiva
                </p>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="text-[#0066CC] font-bold mt-0.5">✓</span>
                    <span>Gestão completa: limpeza, precificação, atendimento 24/7</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="text-[#0066CC] font-bold mt-0.5">✓</span>
                    <span>+1000 imóveis gerenciados no Brasil</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="text-[#0066CC] font-bold mt-0.5">✓</span>
                    <span>Transparência total com portal do proprietário</span>
                  </li>
                </ul>
              </div>

              <Calendar
                selectedDate={selectedDate}
                onSelectDate={(date) => {
                  setSelectedDate(date);
                  setSelectedSession(null);
                }}
              />

              {selectedDate && (
                <div className="mt-4 bg-white rounded-2xl shadow p-4">
                  {loadingSessions ? (
                    <p className="text-center text-sm text-gray-400 py-4">
                      Buscando horários...
                    </p>
                  ) : (
                    <TimeSlots
                      sessions={sessions}
                      selectedDate={selectedDate}
                      onSelect={handleSelectSession}
                    />
                  )}
                </div>
              )}

              {/* O que você vai descobrir */}
              <div className="mt-5 bg-white rounded-2xl shadow-sm border border-blue-100 p-6">
                <p className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wide">
                  O que você vai descobrir nesta apresentação
                </p>
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">💰</span>
                    <span className="text-sm text-slate-600">Potencial de rentabilidade da sua propriedade</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-xl">📊</span>
                    <span className="text-sm text-slate-600">Números reais de imóveis similares ao seu</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-xl">🔑</span>
                    <span className="text-sm text-slate-600">Como funciona nosso modelo de gestão</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-xl">📱</span>
                    <span className="text-sm text-slate-600">Ferramentas e acompanhamento em tempo real</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step: Registration form */}
          {step === "form" && selectedSession && (
            <RegistrationForm
              session={selectedSession}
              onSuccess={handleRegistered}
              onBack={handleBack}
            />
          )}

          {/* Step: Confirmed */}
          {step === "confirmed" && (
            <div className="bg-white rounded-2xl shadow p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Inscrição confirmada!
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                Você receberá um e-mail com os detalhes. Acesse a sala de espera no horário agendado.
              </p>
              <a
                href={roomUrl}
                className="inline-block bg-[#0066CC] text-white font-semibold py-3 px-6
                  rounded-xl hover:bg-blue-700 transition-colors"
              >
                Acessar sala de espera
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Seazone Footer */}
      <footer className="w-full py-6 px-6 border-t border-blue-100/60 bg-white/60 backdrop-blur-sm">
        <div className="max-w-md mx-auto text-center space-y-2">
          <p className="text-sm text-gray-500">
            Conheça mais em{" "}
            <a
              href="https://seazone.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0066CC] font-medium hover:underline"
            >
              seazone.com.br
            </a>
          </p>
          <p className="text-xs text-gray-400">
            Siga no Instagram:{" "}
            <a
              href="https://instagram.com/destinoseazone"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0066CC] hover:underline"
            >
              @destinoseazone
            </a>{" "}
            e{" "}
            <a
              href="https://instagram.com/monicamedeiross"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0066CC] hover:underline"
            >
              @monicamedeiross
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
