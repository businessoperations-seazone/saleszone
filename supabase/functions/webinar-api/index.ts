import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// IMPORTANT: The Google Service Account must have the Gmail send scope authorized
// in Google Workspace Admin Console (Security > API Controls > Domain-wide Delegation).
// Required scope: https://www.googleapis.com/auth/gmail.send
// The SA already has calendar.events.readonly — add gmail.send alongside it.
const FRONTEND_URL = "https://frontend-nine-ivory-62.vercel.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function csvResponse(content: string, filename = "export.csv") {
  return new Response(content, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
    },
  });
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ── Email via Resend ──────────────────────────────────────────────────────────

async function sendEmail(senderName: string, to: string, subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  // Use Resend default domain for now (until seazone.com.br is verified in Resend)
  const from = `${senderName} <onboarding@resend.dev>`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Resend API error: ${resp.status} ${err}`);
  }
}

function buildConfirmationEmail(
  leadName: string,
  closerName: string,
  sessionStartsAt: string,
  roomUrl: string
): string {
  // Format date in pt-BR, BRT timezone
  const dt = new Date(sessionStartsAt);
  const dateStr = dt.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = dt.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

  const firstName = leadName.split(" ")[0];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:28px 40px;text-align:center;">
              <h1 style="color:#ffffff;font-size:22px;margin:0;letter-spacing:0.5px;">Seazone Investimentos</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;color:#1e293b;">
              <p style="font-size:18px;font-weight:bold;margin:0 0 16px;">Olá, ${firstName}! 👋</p>
              <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
                Seu agendamento está confirmado! Estamos animados em recebê-lo na nossa apresentação.
              </p>
              <!-- Info box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-left:4px solid #0ea5e9;border-radius:4px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Data e horário</p>
                    <p style="margin:0;font-size:16px;font-weight:bold;color:#0f172a;text-transform:capitalize;">${dateStr} às ${timeStr} (BRT)</p>
                  </td>
                </tr>
              </table>
              <!-- CTA -->
              <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
                Clique no botão abaixo para acessar a sala no momento da apresentação:
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
                <tr>
                  <td style="background:#0ea5e9;border-radius:6px;">
                    <a href="${roomUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Acessar a sala</a>
                  </td>
                </tr>
              </table>
              <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 8px;">
                Você também receberá um lembrete automático <strong>1 hora antes</strong> da sessão começar.
              </p>
              <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 32px;">
                Qualquer dúvida, é só responder a este e-mail.
              </p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;">
              <p style="font-size:14px;color:#1e293b;margin:0;">
                Abraço,<br>
                <strong>${closerName}</strong><br>
                <span style="color:#64748b;">Seazone Investimentos</span>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © ${new Date().getFullYear()} Seazone Investimentos · Este é um e-mail automático, não responda caso não reconheça este agendamento.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function formatTimeBR(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function formatDateBR(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

// ── Reminder email templates ───────────────────────────────────────────────────

function buildReminder24hEmail(
  leadName: string,
  closerName: string,
  startsAt: string,
  roomUrl: string
): string {
  const firstName = leadName.split(" ")[0];
  const timeStr = formatTimeBR(startsAt);
  const dateStr = formatDateBR(startsAt);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:28px 40px;text-align:center;">
              <h1 style="color:#ffffff;font-size:22px;margin:0;letter-spacing:0.5px;">Seazone Investimentos</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;color:#1e293b;">
              <p style="font-size:18px;font-weight:bold;margin:0 0 16px;">Olá, ${firstName}! 🗓️</p>
              <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
                Sua apresentação Seazone é <strong>amanhã</strong>! Não esqueça de reservar um tempinho para estar presente.
              </p>
              <!-- Info box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border-left:4px solid #eab308;border-radius:4px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Data e horário</p>
                    <p style="margin:0;font-size:16px;font-weight:bold;color:#0f172a;text-transform:capitalize;">${dateStr} às ${timeStr} (BRT)</p>
                  </td>
                </tr>
              </table>
              <!-- CTA -->
              <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
                Clique no botão abaixo para acessar a sala no momento da apresentação:
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
                <tr>
                  <td style="background:#0ea5e9;border-radius:6px;">
                    <a href="${roomUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Acessar a sala</a>
                  </td>
                </tr>
              </table>
              <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 32px;">
                Qualquer dúvida, é só responder a este e-mail.
              </p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;">
              <p style="font-size:14px;color:#1e293b;margin:0;">
                Abraço,<br>
                <strong>${closerName}</strong><br>
                <span style="color:#64748b;">Seazone Investimentos</span>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © ${new Date().getFullYear()} Seazone Investimentos · Este é um e-mail automático, não responda caso não reconheça este agendamento.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildReminder1hEmail(
  leadName: string,
  closerName: string,
  startsAt: string,
  roomUrl: string
): string {
  const firstName = leadName.split(" ")[0];
  const timeStr = formatTimeBR(startsAt);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:28px 40px;text-align:center;">
              <h1 style="color:#ffffff;font-size:22px;margin:0;letter-spacing:0.5px;">Seazone Investimentos</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;color:#1e293b;">
              <p style="font-size:18px;font-weight:bold;margin:0 0 16px;">Olá, ${firstName}! ⏰</p>
              <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
                Falta <strong>1 hora</strong> para a sua apresentação Seazone começar às <strong>${timeStr} (BRT)</strong>!
              </p>
              <!-- Info box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-left:4px solid #f97316;border-radius:4px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Começa em breve</p>
                    <p style="margin:0;font-size:16px;font-weight:bold;color:#0f172a;">Hoje às ${timeStr} (BRT)</p>
                  </td>
                </tr>
              </table>
              <!-- CTA -->
              <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
                Clique no botão abaixo para entrar na sala quando estiver pronto:
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
                <tr>
                  <td style="background:#f97316;border-radius:6px;">
                    <a href="${roomUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Entrar na sala agora</a>
                  </td>
                </tr>
              </table>
              <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 32px;">
                Qualquer dúvida, é só responder a este e-mail.
              </p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;">
              <p style="font-size:14px;color:#1e293b;margin:0;">
                Abraço,<br>
                <strong>${closerName}</strong><br>
                <span style="color:#64748b;">Seazone Investimentos</span>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © ${new Date().getFullYear()} Seazone Investimentos · Este é um e-mail automático, não responda caso não reconheça este agendamento.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Internal: send reminders ───────────────────────────────────────────────────

async function handleInternalReminders(req: Request) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = getSupabase();
  const now = new Date();

  // 24h window: sessions starting 23h to 25h from now
  const win24Start = new Date(now.getTime() + 23 * 3_600_000).toISOString();
  const win24End   = new Date(now.getTime() + 25 * 3_600_000).toISOString();

  // 1h window: sessions starting 30min to 90min from now
  const win1Start  = new Date(now.getTime() + 30 * 60_000).toISOString();
  const win1End    = new Date(now.getTime() + 90 * 60_000).toISOString();

  let sent24 = 0, sent1 = 0, errors = 0;

  // ── 24h reminders ──────────────────────────────────────────────────────────
  const { data: sessions24 } = await supabase
    .from("webinar_sessions")
    .select("*, webinar_closers(*)")
    .eq("status", "scheduled")
    .gte("starts_at", win24Start)
    .lte("starts_at", win24End);

  for (const session of sessions24 || []) {
    const s = session as Record<string, unknown>;
    const closer = (s.webinar_closers as Record<string, unknown> | null) || null;
    const closerEmail = (closer?.email as string) || "gabriela.lemos@seazone.com.br";
    const closerName  = (closer?.name  as string) || "Equipe Seazone";

    const { data: regs } = await supabase
      .from("webinar_registrations")
      .select("*")
      .eq("session_id", s.id as string)
      .is("cancelled_at", null)
      .is("reminder_24h_sent_at", null);

    for (const reg of regs || []) {
      const r = reg as Record<string, unknown>;
      try {
        const roomUrl = `${FRONTEND_URL}/webinar/sala/${s.id}?token=${r.access_token}`;
        const html = buildReminder24hEmail(r.name as string, closerName, s.starts_at as string, roomUrl);
        await sendEmail(
          closerName,
          r.email as string,
          `Sua apresentação Seazone é amanhã às ${formatTimeBR(s.starts_at as string)}`,
          html
        );
        await supabase
          .from("webinar_registrations")
          .update({ reminder_24h_sent_at: new Date().toISOString() })
          .eq("id", r.id as string);
        sent24++;
      } catch (err) {
        console.error(`[reminder-24h] Failed for ${r.email}:`, err);
        errors++;
      }
    }
  }

  // ── 1h reminders ───────────────────────────────────────────────────────────
  const { data: sessions1 } = await supabase
    .from("webinar_sessions")
    .select("*, webinar_closers(*)")
    .eq("status", "scheduled")
    .gte("starts_at", win1Start)
    .lte("starts_at", win1End);

  for (const session of sessions1 || []) {
    const s = session as Record<string, unknown>;
    const closer = (s.webinar_closers as Record<string, unknown> | null) || null;
    const closerEmail = (closer?.email as string) || "gabriela.lemos@seazone.com.br";
    const closerName  = (closer?.name  as string) || "Equipe Seazone";

    const { data: regs } = await supabase
      .from("webinar_registrations")
      .select("*")
      .eq("session_id", s.id as string)
      .is("cancelled_at", null)
      .is("reminder_1h_sent_at", null);

    for (const reg of regs || []) {
      const r = reg as Record<string, unknown>;
      try {
        const roomUrl = `${FRONTEND_URL}/webinar/sala/${s.id}?token=${r.access_token}`;
        const html = buildReminder1hEmail(r.name as string, closerName, s.starts_at as string, roomUrl);
        await sendEmail(
          closerName,
          r.email as string,
          `Falta 1 hora! Sua apresentação Seazone começa às ${formatTimeBR(s.starts_at as string)}`,
          html
        );
        await supabase
          .from("webinar_registrations")
          .update({ reminder_1h_sent_at: new Date().toISOString() })
          .eq("id", r.id as string);
        sent1++;
      } catch (err) {
        console.error(`[reminder-1h] Failed for ${r.email}:`, err);
        errors++;
      }
    }
  }

  console.log(`[webinar-api] Reminders: sent_24h=${sent24} sent_1h=${sent1} errors=${errors}`);
  return json({ sent_24h: sent24, sent_1h: sent1, errors });
}

// ─────────────────────────────────────────────────────────────────────────────

async function requireAdmin(req: Request): Promise<Record<string, unknown>> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice(7);

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  );
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user?.email?.endsWith("@seazone.com.br")) throw new Error("Forbidden");
  return user as Record<string, unknown>;
}

async function validateToken(supabase: ReturnType<typeof getSupabase>, sessionId: string, token: string) {
  const { data } = await supabase
    .from("webinar_registrations")
    .select("*")
    .eq("session_id", sessionId)
    .eq("access_token", token)
    .is("cancelled_at", null)
    .maybeSingle();
  return data;
}

// ── Closers ───────────────────────────────────────────────────────────────────

async function handleClosers(method: string, segments: string[], _req: Request) {
  const supabase = getSupabase();
  const slug = segments[0];

  if (method === "GET" && !slug) {
    const { data } = await supabase
      .from("webinar_closers")
      .select("*")
      .eq("is_active", true)
      .order("name");
    return json(data || []);
  }

  if (method === "GET" && slug) {
    const { data } = await supabase
      .from("webinar_closers")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (!data) return json({ error: "Closer not found" }, 404);
    return json(data);
  }

  return json({ error: "Method not allowed" }, 405);
}

// ── Slots ─────────────────────────────────────────────────────────────────────

const SLOT_REQUIRED = ["day_of_week", "time", "duration_minutes", "max_participants", "presenter_email"];

function validateSlotData(data: Record<string, unknown>, requireAll: boolean): string | null {
  if (requireAll) {
    const missing = SLOT_REQUIRED.filter(f => !(f in data));
    if (missing.length) return `Campos obrigatórios ausentes: ${missing.join(", ")}`;
  }
  if ("presenter_email" in data) {
    const email = data.presenter_email;
    if (typeof email !== "string" || !email.endsWith("@seazone.com.br"))
      return "presenter_email deve ser @seazone.com.br";
  }
  if ("day_of_week" in data) {
    const dow = data.day_of_week;
    if (typeof dow !== "number" || dow < 0 || dow > 6)
      return "day_of_week deve ser um inteiro entre 0 e 6";
  }
  return null;
}

async function cascadeDeactivateSlot(supabase: ReturnType<typeof getSupabase>, slotId: string) {
  const today = new Date().toISOString().split("T")[0];
  const { data: sessions } = await supabase
    .from("webinar_sessions")
    .select("id")
    .eq("slot_id", slotId)
    .eq("status", "scheduled")
    .gte("date", today);

  for (const session of sessions || []) {
    const { count } = await supabase
      .from("webinar_registrations")
      .select("*", { count: "exact", head: true })
      .eq("session_id", session.id);

    if ((count ?? 0) > 0) {
      await supabase.from("webinar_sessions").update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Slot desativado",
      }).eq("id", session.id);
    } else {
      await supabase.from("webinar_sessions").delete().eq("id", session.id);
    }
  }
}

async function handleSlots(method: string, segments: string[], req: Request) {
  const supabase = getSupabase();
  const slotId = segments[0];

  if (method === "GET") {
    const url = new URL(req.url);
    const closerId = url.searchParams.get("closer_id");
    let q = supabase.from("webinar_slots").select("*").order("day_of_week").order("time");
    if (closerId) q = q.eq("closer_id", closerId);
    const { data } = await q;
    return json(data || []);
  }

  if (method === "POST") {
    await requireAdmin(req);
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (!data.closer_id) return json({ error: "Campo obrigatório ausente: closer_id" }, 400);
    const err = validateSlotData(data, true);
    if (err) return json({ error: err }, 400);
    const { data: created, error } = await supabase.from("webinar_slots").insert(data).select().single();
    if (error) return json({ error: error.message }, 500);
    return json(created, 201);
  }

  if (method === "PUT" && slotId) {
    await requireAdmin(req);
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    const err = validateSlotData(data, false);
    if (err) return json({ error: err }, 400);
    if (data.is_active === false) await cascadeDeactivateSlot(supabase, slotId);
    const { data: updated, error } = await supabase.from("webinar_slots").update(data).eq("id", slotId).select().single();
    if (error) return json({ error: error.message }, 500);
    return json(updated);
  }

  if (method === "DELETE" && slotId) {
    await requireAdmin(req);
    await supabase.from("webinar_slots").delete().eq("id", slotId);
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return json({ error: "Method not allowed" }, 405);
}

// ── Sessions ──────────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set(["scheduled", "live", "ended", "cancelled"]);

async function handleSessions(method: string, segments: string[], req: Request) {
  const supabase = getSupabase();
  const url = new URL(req.url);

  // GET /sessions/available
  if (method === "GET" && segments[0] === "available") {
    const date = url.searchParams.get("date");
    if (!date) return json({ error: "Parâmetro 'date' obrigatório" }, 400);
    const closerSlug = url.searchParams.get("closer_slug");

    let closerId: string | null = null;
    if (closerSlug) {
      const { data: closer } = await supabase
        .from("webinar_closers")
        .select("id")
        .eq("slug", closerSlug)
        .eq("is_active", true)
        .maybeSingle();
      if (!closer) return json({ error: "Closer não encontrado" }, 404);
      closerId = closer.id;
    }

    let q = supabase.from("webinar_sessions").select("*").eq("date", date).eq("status", "scheduled").order("starts_at");
    if (closerId) q = q.eq("closer_id", closerId);
    const { data: sessions } = await q;

    // Batch-fetch slots
    const slotIds = [...new Set((sessions || []).map((s: Record<string, unknown>) => s.slot_id as string).filter(Boolean))];
    const slotsMap: Record<string, Record<string, unknown>> = {};
    if (slotIds.length) {
      const { data: slots } = await supabase.from("webinar_slots").select("*").in("id", slotIds);
      for (const sl of slots || []) slotsMap[sl.id as string] = sl;
    }

    // Filter out sessions that have already started (with 15-min buffer)
    const now = new Date();
    const cutoff = new Date(now.getTime() + 15 * 60 * 1000);
    const futureSessions = (sessions || []).filter((s: Record<string, unknown>) => new Date(s.starts_at as string) > cutoff);

    const result = futureSessions.map((session: Record<string, unknown>) => {
      const slot = slotsMap[session.slot_id as string] || {};
      const maxParticipants = (slot.max_participants ?? session.max_participants ?? 0) as number;
      const registrationsCount = (session.registrations_count ?? 0) as number;
      const remaining = Math.max(0, maxParticipants - registrationsCount);
      return remaining > 0 ? { ...session, remaining_capacity: remaining } : null;
    }).filter(Boolean);

    return json(result);
  }

  // PATCH /sessions/:id/status
  if (method === "PATCH" && segments[1] === "status") {
    const sessionId = segments[0];
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    const newStatus = data.status as string;
    if (!newStatus) return json({ error: "Campo 'status' obrigatório" }, 400);
    if (!VALID_STATUSES.has(newStatus)) return json({ error: `Status inválido. Valores aceitos: ${[...VALID_STATUSES].join(", ")}` }, 400);

    const updateData: Record<string, unknown> = { status: newStatus };

    if (newStatus === "cancelled") {
      await requireAdmin(req);
      updateData.cancelled_at = new Date().toISOString();
      updateData.cancel_reason = (data.cancel_reason as string) || "Sessão cancelada";
      // Morada notification is skipped (stub)
    }

    const { data: updated, error } = await supabase.from("webinar_sessions").update(updateData).eq("id", sessionId).select().single();
    if (error) return json({ error: error.message }, 500);
    return json(updated);
  }

  // GET /sessions/:id
  if (method === "GET" && segments[0] && segments[0] !== "available") {
    const { data, error } = await supabase.from("webinar_sessions").select("*").eq("id", segments[0]).maybeSingle();
    if (error || !data) return json({ error: "Sessão não encontrada" }, 404);
    // Include closer info for frontend routing
    if (data.closer_id) {
      const { data: closer } = await supabase
        .from("webinar_closers")
        .select("slug, name")
        .eq("id", data.closer_id)
        .maybeSingle();
      if (closer) {
        data.closer_slug = closer.slug;
        data.closer_name = closer.name;
      }
    }
    return json(data);
  }

  // GET /sessions (list)
  if (method === "GET") {
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");
    const status = url.searchParams.get("status");
    const closerId = url.searchParams.get("closer_id");

    let q = supabase.from("webinar_sessions").select("*").order("date").order("starts_at");
    if (dateFrom) q = q.gte("date", dateFrom);
    if (dateTo) q = q.lte("date", dateTo);
    if (status) q = q.eq("status", status);
    if (closerId) q = q.eq("closer_id", closerId);
    const { data } = await q;
    return json(data || []);
  }

  // POST /sessions (admin)
  if (method === "POST") {
    await requireAdmin(req);
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (!data || Object.keys(data).length === 0) return json({ error: "Payload obrigatório" }, 400);
    const { data: created, error } = await supabase.from("webinar_sessions").insert(data).select().single();
    if (error) return json({ error: error.message }, 500);
    return json(created, 201);
  }

  return json({ error: "Method not allowed" }, 405);
}

// ── Registrations ─────────────────────────────────────────────────────────────

const REG_REQUIRED = ["session_id", "name", "email", "phone"];

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c] ?? c));
}

async function handleRegistrations(method: string, segments: string[], req: Request) {
  const supabase = getSupabase();

  // GET /registrations/validate
  if (method === "GET" && segments[0] === "validate") {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");
    const token = url.searchParams.get("token");
    if (!sessionId || !token) return json({ error: "Parâmetros session_id e token são obrigatórios" }, 400);
    const reg = await validateToken(supabase, sessionId, token);
    if (!reg) return json({ error: "Token inválido ou expirado" }, 401);
    return json(reg);
  }

  // POST /registrations/attend
  if (method === "POST" && segments[0] === "attend") {
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = data.session_id as string;
    const token = data.token as string;
    if (!sessionId || !token) return json({ error: "Campos session_id e token são obrigatórios" }, 400);
    const reg = await validateToken(supabase, sessionId, token);
    if (!reg) return json({ error: "Token inválido ou expirado" }, 401);
    const now = new Date().toISOString();
    const { data: updated } = await supabase
      .from("webinar_registrations")
      .update({ attended_at: now })
      .eq("id", (reg as Record<string, unknown>).id)
      .select()
      .single();
    return json(updated || { ...(reg as object), attended_at: now });
  }

  // POST /registrations/cancel
  if (method === "POST" && segments[0] === "cancel") {
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = data.session_id as string;
    const token = data.token as string;
    if (!sessionId || !token) return json({ error: "Campos session_id e token são obrigatórios" }, 400);
    const reg = await validateToken(supabase, sessionId, token);
    if (!reg) return json({ error: "Token inválido ou expirado" }, 401);
    const now = new Date().toISOString();
    const { data: updated } = await supabase
      .from("webinar_registrations")
      .update({ cancelled_at: now })
      .eq("id", (reg as Record<string, unknown>).id)
      .select()
      .single();
    return json(updated || { ...(reg as object), cancelled_at: now });
  }

  // POST /registrations (register lead)
  if (method === "POST") {
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    const missing = REG_REQUIRED.filter(f => !data[f]);
    if (missing.length) return json({ error: `Campos obrigatórios ausentes: ${missing.join(", ")}` }, 400);

    const sessionId = data.session_id as string;

    const { data: session } = await supabase.from("webinar_sessions").select("*").eq("id", sessionId).maybeSingle();
    if (!session) return json({ error: "Sessão não encontrada" }, 404);
    if ((session as Record<string, unknown>).status === "cancelled") return json({ error: "Sessão cancelada" }, 409);

    const s = session as Record<string, unknown>;

    // Fetch closer (best-effort, used for confirmation email)
    let closer: Record<string, unknown> | null = null;
    if (s.closer_id) {
      const { data: closerData } = await supabase
        .from("webinar_closers")
        .select("*")
        .eq("id", s.closer_id)
        .maybeSingle();
      closer = (closerData as Record<string, unknown>) || null;
    }

    // Check capacity
    let maxParticipants = (s.max_participants ?? 0) as number;
    if (s.slot_id) {
      const { data: slot } = await supabase.from("webinar_slots").select("max_participants").eq("id", s.slot_id).maybeSingle();
      if (slot && (slot as Record<string, unknown>).max_participants) maxParticipants = (slot as Record<string, unknown>).max_participants as number;
    }
    if (maxParticipants > 0) {
      const { count } = await supabase
        .from("webinar_registrations")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .is("cancelled_at", null);
      if ((count ?? 0) >= maxParticipants) return json({ error: "Capacidade esgotada" }, 409);
    }

    // Let the DB generate access_token (uuid DEFAULT gen_random_uuid())
    const insertPayload: Record<string, unknown> = {
      session_id: sessionId,
      name: data.name,
      email: data.email,
      phone: data.phone,
    };
    if (data.pipedrive_deal_url) insertPayload.pipedrive_deal_url = data.pipedrive_deal_url;

    const { data: reg, error } = await supabase.from("webinar_registrations").insert(insertPayload).select().single();
    if (error) return json({ error: error.message }, 500);

    const roomUrl = `${FRONTEND_URL}/webinar/sala/${sessionId}?token=${reg.access_token}`;

    // Send confirmation email — best-effort (do not fail registration if email fails)
    try {
      const senderName = (closer?.name as string) || "Gabriela Lemos";
      const startsAt = (s.starts_at as string) || new Date().toISOString();
      const htmlBody = buildConfirmationEmail(data.name as string, senderName, startsAt, roomUrl);
      await sendEmail(senderName, data.email as string, "Seu agendamento na Seazone está confirmado!", htmlBody);
      console.log(`[webinar-api] Confirmation email sent to ${data.email}`);
    } catch (emailErr) {
      console.error("[webinar-api] Failed to send confirmation email:", emailErr);
    }

    return json({ access_token: reg.access_token, room_url: roomUrl, registration: reg }, 201);
  }

  return json({ error: "Method not allowed" }, 405);
}

// ── Messages ──────────────────────────────────────────────────────────────────

const MAX_CONTENT_LENGTH = 500;

async function handleMessages(method: string, segments: string[], req: Request) {
  const supabase = getSupabase();

  // POST /messages (send)
  if (method === "POST") {
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = data.session_id as string;
    const token = data.token as string;
    const content = (data.content as string) || "";

    if (!sessionId || !token) return json({ error: "Campos session_id e token são obrigatórios" }, 400);
    if (!content) return json({ error: "Campo content é obrigatório" }, 400);
    if (content.length > MAX_CONTENT_LENGTH) return json({ error: `Mensagem deve ter no máximo ${MAX_CONTENT_LENGTH} caracteres` }, 400);

    const reg = await validateToken(supabase, sessionId, token);
    if (!reg) return json({ error: "Token inválido ou expirado" }, 401);

    const r = reg as Record<string, unknown>;
    const message = {
      session_id: sessionId,
      registration_id: r.id,
      content,
      sender_type: "lead",
      sender_name: r.name || "",
    };

    const { data: created, error } = await supabase.from("webinar_messages").insert(message).select().single();
    if (error) return json({ error: error.message }, 500);
    return json(created, 201);
  }

  // DELETE /messages/:id (soft delete, admin)
  if (method === "DELETE" && segments[0]) {
    await requireAdmin(req);
    const { data: updated } = await supabase
      .from("webinar_messages")
      .update({ is_deleted: true })
      .eq("id", segments[0])
      .select()
      .single();
    return json(updated || { id: segments[0], is_deleted: true });
  }

  // GET /messages/:sessionId
  if (method === "GET" && segments[0]) {
    const { data } = await supabase
      .from("webinar_messages")
      .select("*")
      .eq("session_id", segments[0])
      .eq("is_deleted", false)
      .order("created_at");
    return json(data || []);
  }

  return json({ error: "Method not allowed" }, 405);
}

// ── Admin ─────────────────────────────────────────────────────────────────────

async function handleAdmin(method: string, segments: string[], req: Request) {
  const supabase = getSupabase();

  // All admin routes require auth
  await requireAdmin(req);

  // GET /admin/dashboard
  if (method === "GET" && segments[0] === "dashboard") {
    const today = new Date().toISOString().split("T")[0];
    const { data: sessionRows } = await supabase.from("webinar_sessions").select("id, status").eq("date", today);
    const sessions = sessionRows || [];
    const totalSessions = sessions.length;
    const liveNow = sessions.filter((s: Record<string, unknown>) => s.status === "live").length;

    const sessionIds = sessions.map((s: Record<string, unknown>) => s.id as string);
    let registered = 0, attended = 0, converted = 0;

    if (sessionIds.length) {
      const { data: regs } = await supabase
        .from("webinar_registrations")
        .select("attended_at, converted")
        .in("session_id", sessionIds)
        .is("cancelled_at", null);
      registered = (regs || []).length;
      attended = (regs || []).filter((r: Record<string, unknown>) => r.attended_at).length;
      converted = (regs || []).filter((r: Record<string, unknown>) => r.converted).length;
    }

    return json({
      date: today,
      sessions: totalSessions,
      live_now: liveNow,
      registered,
      attended,
      converted,
      conversion_rate: attended > 0 ? Math.round((converted / attended) * 100 * 10) / 10 : 0,
    });
  }

  // POST /admin/sessions/:id/cta
  if (method === "POST" && segments[0] === "sessions" && segments[2] === "cta") {
    const sessionId = segments[1];
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (data.active === undefined) return json({ error: "Campo 'active' obrigatório" }, 400);
    const { data: updated } = await supabase
      .from("webinar_sessions")
      .update({ cta_active: Boolean(data.active) })
      .eq("id", sessionId)
      .select()
      .single();
    return json(updated || { id: sessionId, cta_active: Boolean(data.active) });
  }

  // POST /admin/sessions/:id/message
  if (method === "POST" && segments[0] === "sessions" && segments[2] === "message") {
    const sessionId = segments[1];
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (!data.content) return json({ error: "Campo 'content' obrigatório" }, 400);
    const message = {
      session_id: sessionId,
      content: data.content,
      sender_type: "presenter",
      sender_name: (data.presenter_email as string) || "Apresentador",
    };
    const { data: created, error } = await supabase.from("webinar_messages").insert(message).select().single();
    if (error) return json({ error: error.message }, 500);
    return json(created, 201);
  }

  // GET /admin/sessions/:id/registrations
  if (method === "GET" && segments[0] === "sessions" && segments[2] === "registrations") {
    const sessionId = segments[1];
    const { data } = await supabase
      .from("webinar_registrations")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at");
    return json(data || []);
  }

  // GET /admin/sessions/:id/details
  if (method === "GET" && segments[0] === "sessions" && segments[2] === "details") {
    const sessionId = segments[1];

    const { data: session, error: sessErr } = await supabase
      .from("webinar_sessions")
      .select("*, webinar_closers(*)")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessErr || !session) return json({ error: "Sessão não encontrada" }, 404);

    const { data: regs } = await supabase
      .from("webinar_registrations")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at");

    const registrations = regs || [];
    const total = registrations.length;
    const confirmed = registrations.filter((r: Record<string, unknown>) => !r.cancelled_at).length;
    const attended = registrations.filter((r: Record<string, unknown>) => r.attended_at).length;

    const s = session as Record<string, unknown>;
    const closer = (s.webinar_closers as Record<string, unknown> | null) || null;

    return json({
      session: {
        id: s.id,
        date: s.date,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        status: s.status,
        google_meet_link: s.google_meet_link,
        closer: closer ? { id: closer.id, name: closer.name, email: closer.email, slug: closer.slug } : null,
      },
      stats: { total, confirmed, attended },
      registrations,
    });
  }

  // POST /admin/registrations/cta
  if (method === "POST" && segments[0] === "registrations" && segments[1] === "cta") {
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = data.session_id as string;
    const token = data.token as string;
    if (!sessionId || !token) return json({ error: "Campos session_id e token são obrigatórios" }, 400);

    const reg = await validateToken(supabase, sessionId, token);
    if (!reg) return json({ error: "Token inválido ou expirado" }, 401);

    const r = reg as Record<string, unknown>;
    const now = new Date().toISOString();
    const { data: updated } = await supabase
      .from("webinar_registrations")
      .update({ converted: true, converted_at: now, cta_response: data.form_data })
      .eq("id", r.id)
      .select()
      .single();
    return json(updated || { ...r, converted: true, converted_at: now });
  }

  // GET /admin/registrations/export
  if (method === "GET" && segments[0] === "registrations" && segments[1] === "export") {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    let q = supabase.from("webinar_registrations").select("*").order("created_at");
    if (sessionId) q = q.eq("session_id", sessionId);
    const { data: regs } = await q;

    // Fetch sessions for label
    const sessionIds = [...new Set((regs || []).map((r: Record<string, unknown>) => r.session_id as string).filter(Boolean))];
    const sessionsMap: Record<string, Record<string, unknown>> = {};
    if (sessionIds.length) {
      const { data: sessions } = await supabase.from("webinar_sessions").select("id, date, starts_at").in("id", sessionIds);
      for (const s of sessions || []) sessionsMap[s.id as string] = s;
    }

    const lines: string[] = ["Nome,Email,Telefone,Sessão,Registrado em,Presente,Convertido"];
    for (const r of regs || []) {
      const rr = r as Record<string, unknown>;
      const s = sessionsMap[rr.session_id as string] || {};
      const label = `${s.date || ""} ${s.starts_at || ""}`.trim();
      lines.push([
        rr.name, rr.email, rr.phone, label, rr.created_at,
        rr.attended_at ? "Sim" : "Não",
        rr.converted ? "Sim" : "Não",
      ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    }

    return csvResponse(lines.join("\n"), "registrations.csv");
  }

  return json({ error: "Route not found" }, 404);
}

// ── Pipedrive Lookup ──────────────────────────────────────────────────────────

async function handlePipedriveLookup(req: Request) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const dealUrl = body.deal_url as string;
  if (!dealUrl) return json({ error: "deal_url obrigatório" }, 400);

  // Extract deal ID from URL — supports formats like:
  // https://seazone-fd92b9.pipedrive.com/deal/12345
  // https://seazone-fd92b9.pipedrive.com/deal/12345/something
  const match = dealUrl.match(/\/deal\/(\d+)/);
  if (!match) return json({ error: "URL do deal inválida" }, 400);
  const dealId = match[1];

  const token = Deno.env.get("PIPEDRIVE_API_TOKEN");
  if (!token) return json({ error: "Pipedrive não configurado" }, 500);

  // Fetch deal
  const dealResp = await fetch(
    `https://seazone-fd92b9.pipedrive.com/api/v1/deals/${dealId}?api_token=${token}`
  );
  const dealData = await dealResp.json();
  if (!dealData.success || !dealData.data) {
    return json({ error: "Deal não encontrado no Pipedrive" }, 404);
  }
  const deal = dealData.data;

  // Get person if attached
  let person = null;
  if (deal.person_id?.value) {
    const personResp = await fetch(
      `https://seazone-fd92b9.pipedrive.com/api/v1/persons/${deal.person_id.value}?api_token=${token}`
    );
    const personData = await personResp.json();
    if (personData.success) person = personData.data;
  }

  return json({
    deal_id: dealId,
    deal_url: dealUrl,
    deal_title: deal.title,
    organization: deal.org_name,
    name: person?.name || deal.person_id?.name || "",
    email: person?.email?.[0]?.value || "",
    phone: person?.phone?.[0]?.value || "",
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const rawPath = url.pathname;
    // Strip known prefixes
    const pathname = rawPath
      .replace(/^\/functions\/v1\/webinar-api/, "")
      .replace(/^\/webinar-api/, "")
      .replace(/^\/api/, "");
    const segments = pathname.split("/").filter(Boolean);
    const resource = segments[0];
    const rest = segments.slice(1);
    const method = req.method.toUpperCase();
    console.log(`[webinar-api] ${method} ${rawPath} → resource=${resource} rest=${JSON.stringify(rest)}`);

    if (resource === "closers") return await handleClosers(method, rest, req);
    if (resource === "slots") return await handleSlots(method, rest, req);
    if (resource === "sessions") return await handleSessions(method, rest, req);
    if (resource === "registrations") return await handleRegistrations(method, rest, req);
    if (resource === "messages") return await handleMessages(method, rest, req);
    if (resource === "admin") return await handleAdmin(method, rest, req);
    if (resource === "internal" && rest[0] === "send-reminders") return await handleInternalReminders(req);
    if (resource === "pipedrive" && rest[0] === "lookup") return await handlePipedriveLookup(req);

    return json({ error: "Not found" }, 404);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "Unauthorized") return json({ error: "Unauthorized" }, 401);
    if (msg === "Forbidden") return json({ error: "Forbidden" }, 403);
    console.error("[webinar-api]", err);
    return json({ error: "Internal server error" }, 500);
  }
});
