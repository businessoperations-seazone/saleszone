import { useState, useEffect, useRef } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import type { Session, Registration, Message } from "../../lib/types";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";

interface AdminContext {
  token: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function LiveControl() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { token } = useOutletContext<AdminContext>();

  const [session, setSession] = useState<Session | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [presenterEmail, setPresenterEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [togglingCTA, setTogglingCTA] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId || !token) return;

    async function init() {
      try {
        const [sess, regs, msgs] = await Promise.all([
          api.getSession(sessionId!),
          api.admin.getSessionRegistrations(token, sessionId!),
          api.getMessages(sessionId!),
        ]);
        setSession(sess);
        setRegistrations(regs);
        setMessages(msgs.filter((m) => !m.is_deleted));
        // Try to detect presenter email from session slot or use generic
        setPresenterEmail("apresentador@seazone.com.br");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao carregar sessão");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [sessionId, token]);

  // Subscribe to messages realtime
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`admin-chat:${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "webinar_messages",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        if (!msg.is_deleted) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "webinar_messages",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        if (msg.is_deleted) {
          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  // Auto-scroll chat
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleStatusChange(newStatus: "live" | "ended") {
    if (!sessionId) return;
    try {
      const updated = await api.admin.updateSessionStatus(token, sessionId, newStatus);
      setSession(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar status");
    }
  }

  async function handleToggleCTA() {
    if (!sessionId || !session) return;
    setTogglingCTA(true);
    try {
      await api.admin.toggleCTA(token, sessionId, !session.cta_active);
      setSession((s) => s ? { ...s, cta_active: !s.cta_active } : s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao alternar CTA");
    } finally {
      setTogglingCTA(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = chatInput.trim();
    if (!content || sending || !sessionId) return;
    setSending(true);
    try {
      await api.admin.sendPresenterMessage(token, sessionId, content, presenterEmail);
      setChatInput("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!confirm("Excluir esta mensagem?")) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL || ""}/api/admin/messages/${messageId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao excluir mensagem");
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6 text-red-600 text-sm">
        Sessão não encontrada.
      </div>
    );
  }

  const ctaActive = session.cta_active;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Controle ao Vivo</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {formatDate(session.date)} · {formatTime(session.starts_at)} — {formatTime(session.ends_at)}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
          session.status === "live" ? "bg-green-100 text-green-700" :
          session.status === "scheduled" ? "bg-gray-100 text-gray-700" :
          session.status === "ended" ? "bg-blue-100 text-blue-700" :
          "bg-red-100 text-red-700"
        }`}>
          {session.status === "live" && <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />}
          {session.status === "live" ? "Ao vivo" :
           session.status === "scheduled" ? "Agendada" :
           session.status === "ended" ? "Encerrada" : "Cancelada"}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-semibold underline">Fechar</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Controls */}
        <div className="space-y-4">
          {/* Session controls */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Controles da sessão</h3>
            <div className="flex flex-col gap-3">
              {session.status === "scheduled" && (
                <button
                  onClick={() => handleStatusChange("live")}
                  className="bg-green-600 text-white rounded-xl py-3 font-bold text-base hover:bg-green-700 transition-colors"
                >
                  ▶ Iniciar sessão
                </button>
              )}
              {session.status === "live" && (
                <button
                  onClick={() => handleStatusChange("ended")}
                  className="bg-red-600 text-white rounded-xl py-3 font-bold text-base hover:bg-red-700 transition-colors"
                >
                  ■ Encerrar sessão
                </button>
              )}
            </div>
          </div>

          {/* CTA Toggle */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Botão CTA</h3>
            <button
              onClick={handleToggleCTA}
              disabled={togglingCTA || session.status !== "live"}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                ctaActive
                  ? "bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {togglingCTA ? "..." : ctaActive ? "🔥 CTA ATIVO — Desativar" : "Ativar CTA para leads"}
            </button>
            <p className="text-xs text-gray-400 mt-2 text-center">
              {session.status !== "live" ? "Disponível apenas durante sessão ao vivo" : ctaActive ? "O botão CTA está visível para os participantes" : "O botão CTA está oculto"}
            </p>
          </div>

          {/* Presenter email */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Email do apresentador</h3>
            <input
              type="email"
              value={presenterEmail}
              onChange={(e) => setPresenterEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="apresentador@seazone.com.br"
            />
          </div>
        </div>

        {/* Middle: Participants */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Participantes</h3>
            <span className="text-xs text-gray-500">{registrations.length} inscritos</span>
          </div>
          <div className="overflow-y-auto max-h-96">
            {registrations.length === 0 ? (
              <p className="text-center text-gray-400 text-sm p-8">Nenhum inscrito ainda.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {registrations.map((reg) => (
                  <li key={reg.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{reg.name}</p>
                      <p className="text-xs text-gray-400">{reg.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {reg.attended_at && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Presente
                        </span>
                      )}
                      {reg.converted && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          Convertido
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: Chat */}
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col h-[500px]">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Chat</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 ? (
              <p className="text-center text-gray-400 text-sm mt-8">Nenhuma mensagem ainda.</p>
            ) : (
              messages.map((msg) => {
                const isPresenter = msg.sender_type === "presenter";
                return (
                  <div key={msg.id} className={`flex flex-col ${isPresenter ? "items-start" : "items-end"}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm group relative ${
                      isPresenter ? "bg-blue-50 text-blue-900" : "bg-gray-100 text-gray-800"
                    }`}>
                      {isPresenter && (
                        <span className="block text-xs font-bold text-blue-600 mb-0.5">Apresentador</span>
                      )}
                      <span>{msg.content}</span>
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-5 h-5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600"
                        title="Excluir mensagem"
                      >
                        ×
                      </button>
                    </div>
                    <span className="text-xs text-gray-400 mt-0.5 px-1">
                      {isPresenter ? "Apresentador" : "Lead"} · {formatTime(msg.created_at)}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
          <div className="px-4 py-3 border-t border-gray-100">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value.slice(0, 500))}
                placeholder="Mensagem do apresentador..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                type="submit"
                disabled={sending || !chatInput.trim()}
                className="bg-blue-500 text-white rounded-lg px-3 py-2 text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                Enviar
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
