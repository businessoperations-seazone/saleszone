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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <p>{error}</p>
      </div>
    );
  }

  if (!session) return null;

  if (session.status === "cancelled") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="text-center text-white max-w-sm">
          <div className="text-5xl mb-4">😔</div>
          <h1 className="text-xl font-bold mb-2">Apresentação cancelada</h1>
          <p className="text-slate-400 text-sm mb-6">
            Esta apresentação foi cancelada. Você pode agendar um novo horário.
          </p>
          <a
            href="/webinar"
            className="inline-block bg-blue-500 text-white font-semibold py-3 px-6 rounded-xl
              hover:bg-blue-600 transition-colors"
          >
            Reagendar apresentação
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="text-center text-white max-w-sm w-full">
        {/* Title */}
        <h1 className="text-2xl font-bold mb-1">Apresentação Seazone</h1>

        {/* Date & time */}
        <p className="text-slate-400 text-sm mb-1">{formatDate(session.date)}</p>
        <p className="text-slate-300 text-sm mb-6">às {formatTime(session.starts_at)}</p>

        {/* Greeting */}
        {name && (
          <p className="text-lg font-medium mb-8">
            Olá, <span className="text-blue-400">{name}</span>!
          </p>
        )}

        {/* Waiting area */}
        <div className="bg-slate-800 rounded-2xl p-8 mb-6">
          {!ready ? (
            <>
              <p className="text-slate-400 text-sm mb-3">A apresentação começa em</p>
              <Countdown
                targetTime={session.starts_at}
                onReached={() => setReady(true)}
              />
              <p className="text-slate-500 text-xs mt-4">
                Aguarde nesta página. O botão para entrar aparecerá quando a apresentação começar.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-400 text-sm font-semibold">Ao vivo agora</span>
              </div>
              <p className="text-slate-300 text-sm mb-6">
                A apresentação já começou. Clique para entrar!
              </p>
              <button
                onClick={handleEnter}
                className="w-full py-4 bg-blue-500 text-white font-bold text-lg rounded-xl
                  hover:bg-blue-600 transition-colors shadow-lg"
              >
                Entrar na apresentação
              </button>
            </>
          )}
        </div>

        <p className="text-slate-600 text-xs">
          Mantenha esta aba aberta enquanto aguarda.
        </p>
      </div>
    </div>
  );
}
