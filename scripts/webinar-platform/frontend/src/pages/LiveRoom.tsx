import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import ChatPanel from "../components/ChatPanel";
import CTAButton from "../components/CTAButton";
import type { Session } from "../lib/types";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";

export default function LiveRoom() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [name, setName] = useState<string>("");
  const [ctaVisible, setCtaVisible] = useState(false);
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
        setName(validation.name || "");

        const sess = await api.getSession(sessionId!);
        setSession(sess);
        setCtaVisible(sess.cta_active);
      } catch {
        navigate("/webinar/invalid");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [sessionId, token, navigate]);

  // Subscribe to CTA toggle updates via Supabase Realtime
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "webinar_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const updated = payload.new as Session;
          setCtaVisible(updated.cta_active);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !sessionId) return null;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-xs font-bold text-red-500 uppercase tracking-wide">
            Ao Vivo
          </span>
        </div>
        <div className="w-px h-4 bg-gray-200" />
        <h1 className="text-sm font-semibold text-gray-800">Apresentação Seazone</h1>
      </header>

      {/* Chat fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <ChatPanel
          sessionId={sessionId}
          token={token}
          userName={name}
        />
      </div>

      {/* CTA at bottom */}
      <div className="flex-shrink-0">
        <CTAButton
          visible={ctaVisible}
          sessionId={sessionId}
          token={token}
        />
      </div>
    </div>
  );
}
