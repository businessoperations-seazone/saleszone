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
  const date = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} às ${time}`;
}

interface DealInfo {
  deal_id: string;
  deal_url: string;
  deal_title: string;
  organization: string;
  name: string;
  email: string;
  phone: string;
}

type Step = "deal" | "calendar" | "confirm" | "confirmed" | "reschedule";

export default function SchedulePage() {
  const { closerSlug } = useParams<{ closerSlug: string }>();
  const navigate = useNavigate();
  const [closer, setCloser] = useState<Closer | null>(null);
  const [closerError, setCloserError] = useState(false);
  const [step, setStep] = useState<Step>("deal");

  // Deal step state
  const [dealUrl, setDealUrl] = useState("");
  const [dealInfo, setDealInfo] = useState<DealInfo | null>(null);
  const [dealLoading, setDealLoading] = useState(false);
  const [dealError, setDealError] = useState<string | null>(null);

  // Calendar step state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Confirm step state
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [cidade, setCidade] = useState("");

  // Reschedule state
  const [existingReg, setExistingReg] = useState<{ existing_session_id: string; existing_registration_id: string; existing_starts_at: string | null } | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  // Confirmed step
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

  async function handleDealLookup() {
    if (!dealUrl.trim()) {
      setDealError("Cole o link do deal no Pipedrive");
      return;
    }
    setDealError(null);
    setDealLoading(true);
    try {
      const info = await api.lookupDeal(dealUrl.trim());
      setDealInfo(info);
      setStep("calendar");
    } catch (err: unknown) {
      setDealError(err instanceof Error ? err.message : "Erro ao buscar deal. Verifique o link.");
    } finally {
      setDealLoading(false);
    }
  }

  function handleSelectSession(session: Session) {
    setSelectedSession(session);
    setStep("confirm");
  }

  async function handleConfirm() {
    if (!selectedSession || !dealInfo) return;
    setConfirmError(null);
    if (!cidade.trim()) {
      setConfirmError("Informe a cidade onde o imóvel está localizado.");
      return;
    }
    setConfirmLoading(true);
    try {
      const result = await api.register({
        session_id: selectedSession.id,
        name: dealInfo.name,
        email: dealInfo.email,
        phone: dealInfo.phone,
        pipedrive_deal_url: dealInfo.deal_url,
        cidade: cidade.trim(),
      });
      if (result.already_registered) {
        const url = result.room_url || `/webinar/sala/${selectedSession.id}`;
        setRoomUrl(url);
        setStep("confirmed");
        return;
      }
      if (result.has_existing) {
        setExistingReg({
          existing_session_id: result.existing_session_id,
          existing_registration_id: result.existing_registration_id,
          existing_starts_at: result.existing_starts_at,
        });
        setStep("reschedule");
        return;
      }
      const url = result?.room_url || `/webinar/sala/${selectedSession.id}`;
      setRoomUrl(url);
      setStep("confirmed");
    } catch (err: unknown) {
      setConfirmError(err instanceof Error ? err.message : "Erro ao confirmar inscrição. Tente novamente.");
    } finally {
      setConfirmLoading(false);
    }
  }

  async function handleReschedule() {
    if (!selectedSession || !existingReg) return;
    setRescheduleLoading(true);
    setConfirmError(null);
    try {
      const result = await api.reschedule({
        registration_id: existingReg.existing_registration_id,
        new_session_id: selectedSession.id,
      });
      const url = result?.room_url || `/webinar/sala/${selectedSession.id}`;
      setRoomUrl(url);
      setStep("confirmed");
    } catch (err: unknown) {
      setConfirmError(err instanceof Error ? err.message : "Erro ao reagendar. Tente novamente.");
      setStep("confirm");
    } finally {
      setRescheduleLoading(false);
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

          {/* Step: Deal lookup */}
          {step === "deal" && (
            <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Vamos começar</h2>
              <p className="text-sm text-gray-500 mb-5">
                Cole o link do deal no Pipedrive para identificarmos seus dados
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="deal-url-input">
                    Link do deal no Pipedrive
                  </label>
                  <input
                    id="deal-url-input"
                    type="url"
                    value={dealUrl}
                    onChange={(e) => setDealUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleDealLookup(); }}
                    placeholder="https://seazone-fd92b9.pipedrive.com/deal/12345"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400
                      placeholder:text-gray-300"
                  />
                </div>

                {dealError && (
                  <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{dealError}</p>
                )}

                <button
                  onClick={handleDealLookup}
                  disabled={dealLoading}
                  className="w-full py-3 px-4 rounded-xl bg-[#0066CC] text-white text-sm font-semibold
                    hover:bg-blue-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {dealLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    "Buscar dados"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step: Calendar */}
          {step === "calendar" && dealInfo && (
            <>
              {/* Deal confirmation chip */}
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-green-800 truncate">{dealInfo.deal_title}</p>
                    <p className="text-xs text-green-600 truncate">{dealInfo.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setStep("deal"); setSelectedSession(null); setSelectedDate(null); }}
                  className="text-xs text-green-700 underline underline-offset-2 hover:text-green-900 flex-shrink-0"
                >
                  alterar
                </button>
              </div>

              <Calendar
                selectedDate={selectedDate}
                onSelectDate={(date) => {
                  setSelectedDate(date);
                  setSelectedSession(null);
                  setStep("calendar");
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

          {/* Step: Confirm */}
          {step === "confirm" && dealInfo && selectedSession && (
            <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Confirmar agendamento</h2>
                <p className="text-sm text-gray-500">Verifique os dados antes de confirmar</p>
              </div>

              {/* Session info */}
              <div className="bg-blue-50 rounded-xl px-4 py-3">
                <p className="text-xs text-blue-500 uppercase font-semibold tracking-wide mb-1">Horário selecionado</p>
                <p className="text-sm font-semibold text-blue-900">{formatDateTime(selectedSession.starts_at)}</p>
                <button
                  onClick={() => setStep("calendar")}
                  className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800 mt-1"
                >
                  alterar horário
                </button>
              </div>

              {/* Deal info */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-3">
                <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Dados do lead</p>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <p className="text-xs text-gray-400">Deal</p>
                    <p className="text-sm font-medium text-gray-800">{dealInfo.deal_title}</p>
                    {dealInfo.organization && (
                      <p className="text-xs text-gray-500">{dealInfo.organization}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Nome</p>
                    <p className="text-sm text-gray-800">{dealInfo.name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">E-mail</p>
                    <p className="text-sm text-gray-800">{dealInfo.email || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Telefone</p>
                    <p className="text-sm text-gray-800">{dealInfo.phone || "—"}</p>
                  </div>
                </div>
              </div>

              {/* Cidade do imóvel */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Cidade onde possui imóvel <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                  placeholder="Florianópolis / SC"
                  required
                />
              </div>

              {confirmError && (
                <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{confirmError}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("calendar")}
                  disabled={confirmLoading}
                  className="flex-1 py-3 px-4 rounded-xl border border-gray-200 text-sm font-medium
                    text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={confirmLoading}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#0066CC] text-white text-sm font-semibold
                    hover:bg-blue-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
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

          {/* Step: Reschedule */}
          {step === "reschedule" && existingReg && selectedSession && (
            <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6 space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Agendamento existente</h2>
                  <p className="text-sm text-gray-500">
                    Você já possui um agendamento
                    {existingReg.existing_starts_at && (
                      <> para <span className="font-medium text-gray-700">{formatDateTime(existingReg.existing_starts_at)}</span></>
                    )}.
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl px-4 py-3">
                <p className="text-xs text-blue-500 uppercase font-semibold tracking-wide mb-1">Novo horário</p>
                <p className="text-sm font-semibold text-blue-900">{formatDateTime(selectedSession.starts_at)}</p>
              </div>

              <p className="text-sm text-gray-600">
                Deseja cancelar o agendamento anterior e reagendar para este horário?
              </p>

              {confirmError && (
                <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{confirmError}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setStep("calendar"); setExistingReg(null); }}
                  disabled={rescheduleLoading}
                  className="flex-1 py-3 px-4 rounded-xl border border-gray-200 text-sm font-medium
                    text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleReschedule}
                  disabled={rescheduleLoading}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#0066CC] text-white text-sm font-semibold
                    hover:bg-blue-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {rescheduleLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Reagendando...
                    </>
                  ) : (
                    "Sim, reagendar"
                  )}
                </button>
              </div>
            </div>
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
