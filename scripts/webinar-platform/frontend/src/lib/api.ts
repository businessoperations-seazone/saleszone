import type { Session, Message, Slot, Registration, Closer } from "./types";

const BASE = import.meta.env.VITE_API_URL || "https://ljsvkaidlzflewnimupz.supabase.co/functions/v1/webinar-api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers: extraHeaders, ...rest } = options || {};
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export const api = {
  getCloserBySlug: (slug: string) =>
    request<Closer>(`/api/closers/${slug}`),
  getAvailableSessions: (date: string, closerSlug: string) =>
    request<Session[]>(`/api/sessions/available?date=${date}&closer_slug=${closerSlug}`),
  getSession: (id: string) =>
    request<Session>(`/api/sessions/${id}`),
  register: async (data: { session_id: string; name: string; email: string; phone: string; pipedrive_deal_url?: string; cidade?: string; tipo_imovel?: string }) => {
    const BASE_URL = import.meta.env.VITE_API_URL || "https://ljsvkaidlzflewnimupz.supabase.co/functions/v1/webinar-api";
    const res = await fetch(`${BASE_URL}/api/registrations/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) {
      if (body.has_existing) return body;
      throw new Error(body.error || res.statusText);
    }
    return body;
  },
  reschedule: (data: { registration_id: string; new_session_id: string }) =>
    request<any>("/api/registrations/reschedule", { method: "POST", body: JSON.stringify(data) }),
  registerExternal: async (data: { session_id: string; name: string; email: string; phone: string; cidade: string; closer_slug: string }) => {
    const BASE_URL = import.meta.env.VITE_API_URL || "https://ljsvkaidlzflewnimupz.supabase.co/functions/v1/webinar-api";
    const res = await fetch(`${BASE_URL}/api/registrations/external`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) {
      if (body.has_existing) return body;
      throw new Error(body.error || res.statusText);
    }
    return body;
  },
  lookupDeal: (dealUrl: string) =>
    request<{ deal_id: string; deal_url: string; deal_title: string; organization: string; name: string; email: string; phone: string }>(
      "/api/pipedrive/lookup",
      { method: "POST", body: JSON.stringify({ deal_url: dealUrl }) }
    ),
  validateToken: (sessionId: string, token: string) =>
    request<any>(`/api/registrations/validate?session_id=${sessionId}&token=${token}`),
  markAttended: (sessionId: string, token: string) =>
    request<any>("/api/registrations/attend", {
      method: "POST", body: JSON.stringify({ session_id: sessionId, token }),
    }),
  sendMessage: (sessionId: string, token: string, content: string) =>
    request<any>("/api/messages/", {
      method: "POST", body: JSON.stringify({ session_id: sessionId, token, content }),
    }),
  getMessages: (sessionId: string) =>
    request<Message[]>(`/api/messages/${sessionId}`),
  submitCTA: (sessionId: string, token: string, formData: Record<string, any>) =>
    request<any>("/api/admin/registrations/cta", {
      method: "POST", body: JSON.stringify({ session_id: sessionId, token, form_data: formData }),
    }),

  // Admin API (password-protected in frontend, no JWT required)
  admin: {
    getDashboard: () =>
      request<any>("/admin/dashboard"),
    getClosers: () =>
      request<Closer[]>("/closers/"),
    getSlots: () =>
      request<Slot[]>("/slots/"),
    createSlot: (data: Partial<Slot>) =>
      request<Slot>("/slots/", { method: "POST", body: JSON.stringify(data) }),
    updateSlot: (id: string, data: Partial<Slot>) =>
      request<Slot>(`/slots/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteSlot: (id: string) =>
      request<null>(`/slots/${id}`, { method: "DELETE" }),
    getSessions: (params?: string) =>
      request<Session[]>(`/sessions/${params ? '?' + params : ''}`),
    updateSessionStatus: (id: string, status: string, reason?: string) =>
      request<Session>(`/sessions/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, cancel_reason: reason }) }),
    createSession: (data: any) =>
      request<Session>("/sessions/", { method: "POST", body: JSON.stringify(data) }),
    toggleCTA: (sessionId: string, active: boolean) =>
      request<any>(`/admin/sessions/${sessionId}/cta`, { method: "POST", body: JSON.stringify({ active }) }),
    sendPresenterMessage: (sessionId: string, content: string, email: string) =>
      request<any>(`/admin/sessions/${sessionId}/message`, { method: "POST", body: JSON.stringify({ content, presenter_email: email }) }),
    getSessionRegistrations: (sessionId: string) =>
      request<Registration[]>(`/admin/sessions/${sessionId}/registrations`),
    getAllRegistrations: () =>
      request<Registration[]>("/admin/registrations"),
    updateRegistration: (id: string, data: Partial<Registration>) =>
      request<Registration>(`/admin/registrations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    syncTranscript: (id: string) =>
      request<{ ok: boolean; transcript_id?: string; transcript_title?: string; pipedrive?: { ok: boolean; note_id?: number; error?: string }; error?: string }>(
        `/admin/registrations/${id}/sync-transcript`,
        { method: "POST" }
      ),
    getSessionDetails: (sessionId: string) =>
      request<any>(`/admin/sessions/${sessionId}/details`),
    exportCSV: (sessionId?: string) => {
      const params = sessionId ? `?session_id=${sessionId}` : '';
      return `${BASE}/admin/registrations/export${params}`;
    },
  },
};
