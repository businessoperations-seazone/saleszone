import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import Countdown from "../components/Countdown";
import type { Session } from "../lib/types";
import { api } from "../lib/api";

export default function WaitingRoom() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [name, setName] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !token) {
      navigate("/webinar/invalid");
      return;
    }

    async function init() {
      try {
        // Validate token
        const validation = await api.validateToken(sessionId!, token);
        if (!validation || validation.valid === false) {
          navigate("/webinar/invalid");
          return;
        }
        setName(validation.name || "");

        // Fetch session
        const sess = await api.getSession(sessionId!);
        setSession(sess);

        // If already live, set ready immediately
        if (sess.status === "live") {
          setReady(true);
        }
      } catch {
        navigate("/webinar/invalid");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [sessionId, token, navigate]);

  async function handleEnter() {
    if (!session || !sessionId) return;
    try {
      await api.markAttended(sessionId, token);
    } catch {
      // Non-critical — proceed anyway
    }

    // Open Meet link in new tab using anchor click to avoid popup blockers on mobile
    if (session.google_meet_link) {
      const a = document.createElement("a");
      a.href = session.google_meet_link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    navigate(`/webinar/sala/${sessionId}/live?token=${token}`);
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-100 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-100 flex items-center justify-center text-gray-700">
        <p>{error}</p>
      </div>
    );
  }

  if (!session) return null;

  if (session.status === "cancelled") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-100 flex flex-col">
        <header className="w-full py-5 px-6 flex items-center justify-center border-b border-blue-100/60 bg-white/70 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0066CC] flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight" style={{ color: "#0066CC", letterSpacing: "-0.02em" }}>
              Seazone
            </span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center text-gray-700 max-w-sm">
            <div className="text-5xl mb-4">😔</div>
            <h1 className="text-xl font-bold mb-2 text-gray-900">Apresentação cancelada</h1>
            <p className="text-gray-500 text-sm mb-6">
              Esta apresentação foi cancelada. Você pode agendar um novo horário.
            </p>
            <a
              href="/webinar"
              className="inline-block bg-[#0066CC] text-white font-semibold py-3 px-6 rounded-xl
                hover:bg-blue-700 transition-colors"
            >
              Reagendar apresentação
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-100 flex flex-col">
      {/* Seazone Brand Header */}
      <header className="w-full py-5 px-6 flex items-center justify-center border-b border-blue-100/60 bg-white/70 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0066CC] flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight" style={{ color: "#0066CC", letterSpacing: "-0.02em" }}>
            Seazone
          </span>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="text-center text-gray-800 max-w-sm w-full">
          {/* Title */}
          <h1 className="text-2xl font-bold mb-1 text-gray-900">Apresentação Seazone</h1>

          {/* Date & time */}
          <p className="text-gray-500 text-sm mb-1">{formatDate(session.date)}</p>
          <p className="text-gray-600 text-sm mb-6">às {formatTime(session.starts_at)}</p>

          {/* Greeting */}
          {name && (
            <p className="text-lg font-medium mb-8 text-gray-700">
              Olá, <span className="text-[#0066CC] font-semibold">{name}</span>!
            </p>
          )}

          {/* Waiting area */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 mb-6 shadow-md border border-blue-100">
            {!ready ? (
              <>
                <p className="text-gray-500 text-sm mb-3">A apresentação começa em</p>
                <Countdown
                  targetTime={session.starts_at}
                  onReached={() => setReady(true)}
                />
                <p className="text-gray-400 text-xs mt-4">
                  Aguarde nesta página. O botão para entrar aparecerá quando a apresentação começar.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-red-500 text-sm font-semibold">Ao vivo agora</span>
                </div>
                <p className="text-gray-600 text-sm mb-6">
                  A apresentação já começou. Clique para entrar!
                </p>
                <button
                  onClick={handleEnter}
                  className="w-full py-4 bg-[#0066CC] text-white font-bold text-lg rounded-xl
                    hover:bg-blue-700 transition-colors shadow-lg"
                >
                  Entrar na apresentação
                </button>
              </>
            )}
          </div>

          <p className="text-gray-400 text-xs mb-8">
            Mantenha esta aba aberta enquanto aguarda.
          </p>

          {/* Enquanto aguarda — Conheça a Seazone */}
          <div className="w-full text-left">
            <p className="text-sm font-bold text-slate-800 mb-4 text-center uppercase tracking-wide">
              Enquanto aguarda, conheça a Seazone
            </p>
            <div className="grid grid-cols-1 gap-3">
              {/* Card 1 — Portfolio */}
              <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-blue-100 shadow-sm">
                <p className="text-xs font-semibold text-[#0066CC] uppercase tracking-wide mb-1">Nosso portfolio</p>
                <p className="text-sm text-slate-600 mb-2">
                  Mais de 1000 imóveis em destinos como Florianópolis, Natal, Praia do Rosa e mais.
                </p>
                <a
                  href="https://seazone.com.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#0066CC] font-medium hover:underline"
                >
                  Visitar seazone.com.br →
                </a>
              </div>

              {/* Card 2 — Redes sociais */}
              <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-blue-100 shadow-sm">
                <p className="text-xs font-semibold text-[#0066CC] uppercase tracking-wide mb-1">Redes sociais</p>
                <p className="text-sm text-slate-600 mb-2">
                  Conheça histórias reais de proprietários que transformaram seus imóveis com a Seazone.
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <a href="https://instagram.com/destinoseazone" target="_blank" rel="noopener noreferrer" className="text-xs text-[#0066CC] font-medium hover:underline">
                    @destinoseazone
                  </a>
                  <a href="https://instagram.com/monicamedeiross" target="_blank" rel="noopener noreferrer" className="text-xs text-[#0066CC] font-medium hover:underline">
                    @monicamedeiross
                  </a>
                </div>
              </div>

              {/* Card 3 — Dica */}
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 shadow-sm">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Dica</p>
                <p className="text-sm text-slate-700">
                  Tenha papel e caneta em mãos — vamos mostrar números reais que você vai querer anotar.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
