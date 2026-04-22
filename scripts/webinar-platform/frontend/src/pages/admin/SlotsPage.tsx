import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import type { Slot, Closer } from "../../lib/types";
import { api } from "../../lib/api";

interface AdminContext {
  token: string;
}

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const EMPTY_FORM: Partial<Slot> & { closer_id?: string } = {
  day_of_week: 1,
  time: "10:00",
  duration_minutes: 60,
  max_participants: 100,
  presenter_email: "",
  is_active: true,
  closer_id: "",
};

export default function SlotsPage() {
  const { token } = useOutletContext<AdminContext>();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [closers, setClosers] = useState<Closer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Slot> & { closer_id?: string }>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [slotsData, closersData] = await Promise.all([
        api.admin.getSlots(token),
        api.admin.getClosers(),
      ]);
      setSlots(slotsData);
      setClosers(closersData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar horários");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) load();
  }, [token]);

  function startNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(slot: Slot) {
    setEditingId(slot.id);
    setForm({
      day_of_week: slot.day_of_week,
      time: slot.time,
      duration_minutes: slot.duration_minutes,
      max_participants: slot.max_participants,
      presenter_email: slot.presenter_email,
      is_active: slot.is_active,
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        const updated = await api.admin.updateSlot(token, editingId, form);
        setSlots((prev) => prev.map((s) => (s.id === editingId ? updated : s)));
      } else {
        const created = await api.admin.createSlot(token, form);
        setSlots((prev) => [...prev, created]);
      }
      cancelForm();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar horário");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este horário?")) return;
    try {
      await api.admin.deleteSlot(token, id);
      setSlots((prev) => prev.filter((s) => s.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao excluir horário");
    }
  }

  async function handleToggleActive(slot: Slot) {
    try {
      const updated = await api.admin.updateSlot(token, slot.id, { is_active: !slot.is_active });
      setSlots((prev) => prev.map((s) => (s.id === slot.id ? updated : s)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar horário");
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Horários Recorrentes</h2>
        <button
          onClick={startNew}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          + Novo horário
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-semibold underline">Fechar</button>
        </div>
      )}

      {/* Inline Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">
            {editingId ? "Editar horário" : "Novo horário"}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dia da semana</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.day_of_week ?? 1}
                onChange={(e) => setForm((f) => ({ ...f, day_of_week: Number(e.target.value) }))}
                required
              >
                {DAY_NAMES.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Horário</label>
              <input
                type="time"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.time ?? "10:00"}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Duração (min)</label>
              <input
                type="number"
                min={15}
                max={480}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.duration_minutes ?? 60}
                onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) }))}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Máx. participantes</label>
              <input
                type="number"
                min={1}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.max_participants ?? 100}
                onChange={(e) => setForm((f) => ({ ...f, max_participants: Number(e.target.value) }))}
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Closer</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.closer_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, closer_id: e.target.value }))}
                required
              >
                <option value="">Selecione um closer</option>
                {closers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Email do apresentador</label>
              <input
                type="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.presenter_email ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, presenter_email: e.target.value }))}
                placeholder="apresentador@seazone.com.br"
                required
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active ?? true}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="w-4 h-4"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">Ativo</label>
            </div>
            <div className="col-span-2 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="border border-gray-200 text-gray-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : slots.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          Nenhum horário cadastrado ainda.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dia</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Horário</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Duração</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Máx. Part.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Apresentador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ativo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {slots.map((slot) => (
                <tr key={slot.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{DAY_NAMES[slot.day_of_week]}</td>
                  <td className="px-4 py-3 text-gray-700">{slot.time}</td>
                  <td className="px-4 py-3 text-gray-600">{slot.duration_minutes} min</td>
                  <td className="px-4 py-3 text-gray-600">{slot.max_participants}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">{slot.presenter_email}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(slot)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        slot.is_active ? "bg-blue-600" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          slot.is_active ? "translate-x-4.5" : "translate-x-0.5"
                        }`}
                        style={{ transform: slot.is_active ? "translateX(18px)" : "translateX(2px)" }}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(slot)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(slot.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
