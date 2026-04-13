import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import Countdown from "../components/Countdown";
import type { Session } from "../lib/types";
import { api } from "../lib/api";

// --- Seazone logo icon ---
function SeazoneLogo({ size = 8 }: { size?: number }) {
  const px = size * 4;
  return (
    <div
      className={`w-${size} h-${size} rounded-xl bg-[#0066CC] flex items-center justify-center shadow-md`}
      style={{ width: px, height: px, minWidth: px }}
    >
      <svg
        width={px * 0.55}
        height={px * 0.55}
        fill="none"
        viewBox="0 0 24 24"
        stroke="white"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    </div>
  );
}

// --- Inline SVG icons ---
function IconCalendar() {
  return (
    <svg className="w-5 h-5 text-[#0066CC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg className="w-5 h-5 text-[#0066CC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function IconPerson() {
  return (
    <svg className="w-5 h-5 text-[#0066CC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

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
        const validation = await api.validateToken(sessionId!, token);
        if (!validation || validation.valid === false) {
          navigate("/webinar/invalid");
          return;
        }
        setName(validation.name || "");

        const sess = await api.getSession(sessionId!);
        setSession(sess);

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
    });
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  // --- Loading ---
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center text-gray-700">
        <p>{error}</p>
      </div>
    );
  }

  if (!session) return null;

  // --- Cancelled ---
  if (session.status === "cancelled") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex flex-col">
        <header className="w-full py-5 px-6 flex items-center gap-3 border-b border-blue-100/60 bg-white/70 backdrop-blur-sm">
          <SeazoneLogo size={8} />
          <span className="text-xl font-bold" style={{ color: "#0066CC", letterSpacing: "-0.02em" }}>
            Seazone
          </span>
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
              className="inline-block bg-[#0066CC] text-white font-semibold py-3 px-6 rounded-xl hover:bg-blue-700 transition-colors"
            >
              Reagendar apresentação
            </a>
          </div>
        </div>
      </div>
    );
  }

  // --- Main 2-column layout ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex flex-col">

      {/* ── Main content: 2 columns ── */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 lg:py-12">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">

          {/* ═══ LEFT COLUMN ═══ */}
          <div className="flex flex-col gap-6 order-2 lg:order-1">

            {/* Logo */}
            <div className="flex items-center gap-3">
              <SeazoneLogo size={10} />
              <span className="text-2xl font-bold" style={{ color: "#0066CC", letterSpacing: "-0.02em" }}>
                Seazone
              </span>
            </div>

            {/* Hero headline */}
            <div>
              <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 leading-snug">
                Você está a um passo de descobrir como transformar seu imóvel em{" "}
                <span className="text-[#0066CC]">renda passiva</span>
              </h2>
            </div>

            {/* Portfolio cards */}
            <div className="flex flex-col gap-3">

              {/* Card 1 — Portfolio */}
              <div className="bg-white rounded-xl p-4 border border-blue-100 shadow-sm">
                <p className="text-xs font-semibold text-[#0066CC] uppercase tracking-wide mb-1">
                  Nosso portfólio
                </p>
                <p className="text-sm text-slate-600 mb-2">
                  Mais de 1000 imóveis gerenciados em destinos como Florianópolis, Natal,
                  Praia do Rosa e muito mais.
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
              <div className="bg-white rounded-xl p-4 border border-blue-100 shadow-sm">
                <p className="text-xs font-semibold text-[#0066CC] uppercase tracking-wide mb-1">
                  Redes sociais
                </p>
                <p className="text-sm text-slate-600 mb-2">
                  Conheça histórias reais de proprietários que transformaram seus imóveis
                  com a Seazone.
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <a
                    href="https://instagram.com/destinoseazone"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#0066CC] font-medium hover:underline"
                  >
                    @destinoseazone
                  </a>
                  <a
                    href="https://instagram.com/monicamedeiross"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#0066CC] font-medium hover:underline"
                  >
                    @monicamedeiross
                  </a>
                </div>
              </div>

              {/* Card 3 — Dica */}
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 shadow-sm">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
                  Dica
                </p>
                <p className="text-sm text-slate-700">
                  Tenha papel e caneta em mãos — vamos mostrar números reais que você
                  vai querer anotar.
                </p>
              </div>
            </div>

            {/* Reagendar link */}
            <div className="pt-1">
              <a
                href="/webinar"
                className="inline-flex items-center gap-1 text-sm text-[#0066CC] border border-[#0066CC] rounded-lg px-4 py-2 hover:bg-blue-50 transition-colors font-medium"
              >
                Não vai participar?{" "}
                <span className="font-semibold">Reagendar</span>
              </a>
            </div>
          </div>

          {/* ═══ RIGHT COLUMN — Session card ═══ */}
          <div className="order-1 lg:order-2">
            <div
              className="bg-white rounded-2xl p-7 shadow-xl border border-blue-100"
              style={{ boxShadow: "0 8px 40px 0 rgba(0,102,204,0.13), 0 2px 8px 0 rgba(0,102,204,0.06)" }}
            >
              {/* Card header */}
              <div className="mb-5">
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Sua Apresentação</h1>
                <p className="text-gray-500 text-sm">
                  {name ? (
                    <>
                      <span className="font-semibold text-gray-700">{name}</span>
                      , prepare-se para sua sessão exclusiva.
                    </>
                  ) : (
                    "Prepare-se para sua sessão exclusiva."
                  )}
                </p>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100 mb-5" />

              {/* Session details */}
              <div className="flex flex-col gap-4 mb-5">
                {/* Date */}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    <IconCalendar />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                      Data
                    </p>
                    <p className="text-sm font-medium text-gray-800 capitalize">
                      {formatDate(session.date)}
                    </p>
                  </div>
                </div>

                {/* Time */}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    <IconClock />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                      Horário
                    </p>
                    <p className="text-sm font-medium text-gray-800">
                      {formatTime(session.starts_at)}
                    </p>
                  </div>
                </div>

                {/* Presenter */}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    <IconPerson />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                      Apresentadora
                    </p>
                    <p className="text-sm font-medium text-gray-800">
                      Especialista Seazone
                    </p>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100 mb-5" />

              {/* Countdown / Ready area */}
              {!ready ? (
                <div className="bg-blue-50 rounded-xl px-5 py-4 mb-5 text-center">
                  <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-2">
                    Começa em
                  </p>
                  <div className="flex justify-center">
                    <Countdown targetTime={session.starts_at} onReached={() => setReady(true)} />
                  </div>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 mb-5 text-center">
                  <p className="text-green-700 font-semibold text-sm">
                    ✨ Reunião disponível! Entre agora. ✨
                  </p>
                </div>
              )}

              {/* CTA button */}
              <button
                onClick={handleEnter}
                disabled={!ready}
                className={`w-full py-4 font-bold text-base rounded-xl transition-all duration-200 ${
                  ready
                    ? "bg-[#0066CC] text-white hover:bg-blue-700 shadow-lg hover:shadow-blue-200"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {ready ? "Entrar na Reunião" : "Aguardando início..."}
              </button>

              {/* Footer note */}
              <p className="text-center text-gray-400 text-xs mt-4">
                Mantenha esta aba aberta enquanto aguarda.
              </p>
            </div>
          </div>
          {/* ═══ END RIGHT COLUMN ═══ */}

        </div>
      </div>
      {/* ── End main content ── */}

    </div>
  );
}
