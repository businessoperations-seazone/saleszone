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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Página não encontrada</h2>
          <p className="text-gray-500 text-sm">O link que você acessou não é válido ou foi desativado.</p>
        </div>
      </div>
    );
  }

  if (!closer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-10 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block bg-white border border-gray-200 rounded-full px-4 py-1.5 text-xs text-gray-500 mb-4 shadow-sm">
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
              className="inline-block bg-blue-500 text-white font-semibold py-3 px-6
                rounded-xl hover:bg-blue-600 transition-colors"
            >
              Acessar sala de espera
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
