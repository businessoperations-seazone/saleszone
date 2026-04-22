import type { Session, Message, Slot, Registration, Closer } from "./types";

const BASE = import.meta.env.VITE_API_URL || "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
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
  register: (data: { session_id: string; name: string; email: string; phone: string }) =>
    request<any>("/api/registrations/", { method: "POST", body: JSON.stringify(data) }),
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

  // Admin API (requires Supabase JWT in Authorization header)
  admin: {
    getDashboard: (token: string) =>
      request<any>("/api/admin/dashboard", { headers: { Authorization: `Bearer ${token}` } }),
    getClosers: () =>
      request<Closer[]>("/api/closers/"),
    getSlots: (token: string) =>
      request<Slot[]>("/api/slots/", { headers: { Authorization: `Bearer ${token}` } }),
    createSlot: (token: string, data: Partial<Slot>) =>
      request<Slot>("/api/slots/", { method: "POST", body: JSON.stringify(data), headers: { Authorization: `Bearer ${token}` } }),
    updateSlot: (token: string, id: string, data: Partial<Slot>) =>
      request<Slot>(`/api/slots/${id}`, { method: "PUT", body: JSON.stringify(data), headers: { Authorization: `Bearer ${token}` } }),
    deleteSlot: (token: string, id: string) =>
      request<null>(`/api/slots/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }),
    getSessions: (token: string, params?: string) =>
      request<Session[]>(`/api/sessions/${params ? '?' + params : ''}`, { headers: { Authorization: `Bearer ${token}` } }),
    updateSessionStatus: (token: string, id: string, status: string, reason?: string) =>
      request<Session>(`/api/sessions/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, cancel_reason: reason }), headers: { Authorization: `Bearer ${token}` } }),
    createSession: (token: string, data: any) =>
      request<Session>("/api/sessions/", { method: "POST", body: JSON.stringify(data), headers: { Authorization: `Bearer ${token}` } }),
    toggleCTA: (token: string, sessionId: string, active: boolean) =>
      request<any>(`/api/admin/sessions/${sessionId}/cta`, { method: "POST", body: JSON.stringify({ active }), headers: { Authorization: `Bearer ${token}` } }),
    sendPresenterMessage: (token: string, sessionId: string, content: string, email: string) =>
      request<any>(`/api/admin/sessions/${sessionId}/message`, { method: "POST", body: JSON.stringify({ content, presenter_email: email }), headers: { Authorization: `Bearer ${token}` } }),
    getSessionRegistrations: (token: string, sessionId: string) =>
      request<Registration[]>(`/api/admin/sessions/${sessionId}/registrations`, { headers: { Authorization: `Bearer ${token}` } }),
    exportCSV: (_token: string, sessionId?: string) => {
      const params = sessionId ? `?session_id=${sessionId}` : '';
      return `${BASE}/api/admin/registrations/export${params}`;  // Returns URL for download
    },
  },
};
