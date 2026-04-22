import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import type { Session } from "../lib/types";
import { api } from "../lib/api";

export default function LiveRoom() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId || !token) {
      navigate("/webinar/invalid");
      return;
    }

    async function init() {
      try {
        const validation = await api.validateToken(sessionId!, token);
        if (!validation || validation.valid === false) {
          navigate("/webinar/invalid");
          return;
        }

        const sess = await api.getSession(sessionId!);
        setSession(sess);
      } catch {
        navigate("/webinar/invalid");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [sessionId, token, navigate]);

  function reopenMeet() {
    if (!session?.google_meet_link) return;
    const a = document.createElement("a");
    a.href = session.google_meet_link;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#0066CC] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !sessionId) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Live indicator */}
        <div className="inline-flex items-center gap-2 bg-red-50 border border-red-100 rounded-full px-4 py-1.5 mb-6">
          <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-xs font-bold text-red-600 uppercase tracking-wide">Ao Vivo</span>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-slate-800 mb-3">
          Você está na apresentação
        </h1>
        <p className="text-slate-600 mb-8">
          A apresentação está acontecendo agora no Google Meet em outra aba.
          Se fechou por engano, clique abaixo para reentrar.
        </p>

        {/* Reenter button */}
        <button
          onClick={reopenMeet}
          className="w-full py-4 bg-[#0066CC] text-white font-bold text-lg rounded-xl
            hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
        >
          Reabrir apresentação
        </button>

        <p className="text-xs text-slate-400 mt-6">
          Apresentação Seazone com {session.closer_name || "nossa equipe"}
        </p>
      </div>
    </div>
  );
}
