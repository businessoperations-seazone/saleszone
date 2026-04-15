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

// ── Google SA JWT helpers (for Gmail send) ────────────────────────────────────

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN.*?-----/g, "").replace(/-----END.*?-----/g, "").replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", pemToArrayBuffer(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function getGmailAccessToken(saEmail: string, privateKey: CryptoKey, impersonate: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: saEmail,
    sub: impersonate,
    scope: "https://www.googleapis.com/auth/gmail.send",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = new TextEncoder();
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, enc.encode(unsigned));
  const jwt = `${unsigned}.${base64url(new Uint8Array(signature))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail OAuth error: ${res.status} ${err}`);
  }
  return (await res.json()).access_token;
}

// ── Email via Gmail API ──────────────────────────────────────────────────────

const GMAIL_SENDER = "agendamentos@seazone.com.br";

async function sendEmail(senderName: string, to: string, subject: string, html: string): Promise<void> {
  const credsJson = Deno.env.get("GOOGLE_CALENDAR_CREDENTIALS");
  if (!credsJson) throw new Error("GOOGLE_CALENDAR_CREDENTIALS not configured");
  const creds = JSON.parse(credsJson);
  const privateKey = await importPrivateKey(creds.private_key);
  const accessToken = await getGmailAccessToken(creds.client_email, privateKey, GMAIL_SENDER);

  // Build raw RFC 2822 email
  const boundary = `boundary_${Date.now()}`;
  const rawParts = [
    `From: ${senderName} <${GMAIL_SENDER}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(html))),
    `--${boundary}--`,
  ];
  const raw = rawParts.join("\r\n");
  const rawB64 = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${GMAIL_SENDER}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: rawB64 }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gmail API error: ${resp.status} ${err}`);
  }
}

function buildConfirmationEmail(
  leadName: string,
  closerName: string,
  sessionStartsAt: string,
  roomUrl: string,
  preSellerName?: string | null,
): string {
  const dt = new Date(sessionStartsAt);
  const dateStr = dt.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const timeStr = dt.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  const firstName = leadName.split(" ")[0];
  const blue = "#0066CC";
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:linear-gradient(135deg,#eff6ff,#ffffff,#ecfeff);font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Logo -->
        <tr><td style="padding:0 0 24px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:${blue};border-radius:12px;width:40px;height:40px;text-align:center;vertical-align:middle;">
              <span style="color:#fff;font-size:18px;">&#8962;</span>
            </td>
            <td style="padding-left:12px;">
              <span style="font-size:22px;font-weight:bold;color:${blue};letter-spacing:-0.5px;">Seazone</span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Headline -->
        <tr><td style="padding:0 0 28px;">
          <h1 style="margin:0;font-size:26px;line-height:1.3;color:#0f172a;">
            ${firstName}, sua apresentação está confirmada!
          </h1>
          <p style="margin:8px 0 0;font-size:15px;color:#64748b;line-height:1.5;">
            Você está a um passo de descobrir como transformar seu imóvel em <strong style="color:${blue};">renda passiva</strong>.
          </p>
        </td></tr>

        <!-- Session card -->
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #dbeafe;box-shadow:0 4px 24px rgba(0,102,204,0.08);">
            <tr><td style="padding:28px 28px 8px;">
              <p style="margin:0 0 4px;font-size:20px;font-weight:bold;color:#0f172a;">Sua Apresentação</p>
              <p style="margin:0;font-size:14px;color:#64748b;">Prepare-se para sua sessão exclusiva.</p>
            </td></tr>
            <tr><td style="padding:0 28px;"><div style="border-top:1px solid #f1f5f9;margin:16px 0;"></div></td></tr>
            <!-- Date -->
            <tr><td style="padding:0 28px 12px;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:top;padding-right:12px;">
                  <span style="font-size:18px;">&#128197;</span>
                </td>
                <td>
                  <p style="margin:0;font-size:11px;font-weight:bold;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Data</p>
                  <p style="margin:2px 0 0;font-size:15px;font-weight:600;color:#1e293b;text-transform:capitalize;">${dateStr}</p>
                </td>
              </tr></table>
            </td></tr>
            <!-- Time -->
            <tr><td style="padding:0 28px 12px;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:top;padding-right:12px;">
                  <span style="font-size:18px;">&#128336;</span>
                </td>
                <td>
                  <p style="margin:0;font-size:11px;font-weight:bold;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Horário</p>
                  <p style="margin:2px 0 0;font-size:15px;font-weight:600;color:#1e293b;">${timeStr} (BRT)</p>
                </td>
              </tr></table>
            </td></tr>
            <!-- Presenter -->
            <tr><td style="padding:0 28px ${preSellerName ? '12px' : '20px'};">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:top;padding-right:12px;">
                  <span style="font-size:18px;">&#128100;</span>
                </td>
                <td>
                  <p style="margin:0;font-size:11px;font-weight:bold;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Apresentadora</p>
                  <p style="margin:2px 0 0;font-size:15px;font-weight:600;color:#1e293b;">${closerName}</p>
                </td>
              </tr></table>
            </td></tr>${preSellerName ? `
            <!-- Pre-seller -->
            <tr><td style="padding:0 28px 20px;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:top;padding-right:12px;">
                  <span style="font-size:18px;">&#128172;</span>
                </td>
                <td>
                  <p style="margin:0;font-size:11px;font-weight:bold;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Pré-vendedora</p>
                  <p style="margin:2px 0 0;font-size:15px;font-weight:600;color:#1e293b;">${preSellerName}</p>
                </td>
              </tr></table>
            </td></tr>` : ''}
            <tr><td style="padding:0 28px;"><div style="border-top:1px solid #f1f5f9;margin:0 0 20px;"></div></td></tr>
            <!-- CTA -->
            <tr><td align="center" style="padding:0 28px 28px;">
              <table cellpadding="0" cellspacing="0" width="100%"><tr>
                <td align="center" style="background:${blue};border-radius:12px;">
                  <a href="${roomUrl}" style="display:block;padding:16px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;text-align:center;">
                    Acessar Sala de Espera
                  </a>
                </td>
              </tr></table>
              <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">Mantenha o link salvo — use-o no dia da apresentação.</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Info cards -->
        <tr><td style="padding:24px 0 0;">
          <!-- Portfolio -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #dbeafe;margin-bottom:12px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:bold;color:${blue};text-transform:uppercase;letter-spacing:0.5px;">Nosso portfólio</p>
              <p style="margin:0 0 6px;font-size:13px;color:#475569;line-height:1.5;">Mais de 1000 imóveis gerenciados em Florianópolis, Natal, Praia do Rosa e muito mais.</p>
              <a href="https://seazone.com.br" style="font-size:12px;color:${blue};font-weight:600;text-decoration:none;">Visitar seazone.com.br &#8594;</a>
            </td></tr>
          </table>
          <!-- Social -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #dbeafe;margin-bottom:12px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:bold;color:${blue};text-transform:uppercase;letter-spacing:0.5px;">Redes sociais</p>
              <p style="margin:0 0 6px;font-size:13px;color:#475569;line-height:1.5;">Conheça histórias reais de proprietários que transformaram seus imóveis com a Seazone.</p>
              <a href="https://instagram.com/destinoseazone" style="font-size:12px;color:${blue};font-weight:600;text-decoration:none;">@destinoseazone</a>
              <span style="color:#cbd5e1;margin:0 6px;">·</span>
              <a href="https://instagram.com/monicamedeiross" style="font-size:12px;color:${blue};font-weight:600;text-decoration:none;">@monicamedeiross</a>
            </td></tr>
          </table>
          <!-- Tip -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:12px;border:1px solid #fde68a;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:bold;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Dica</p>
              <p style="margin:0;font-size:13px;color:#44403c;line-height:1.5;">Tenha papel e caneta em mãos — vamos mostrar números reais que você vai querer anotar.</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:28px 0 0;text-align:center;">
          <p style="margin:0 0 4px;font-size:13px;color:#1e293b;">
            Abraço, <strong>${closerName}</strong> — Seazone Investimentos
          </p>
          <p style="margin:0;font-size:11px;color:#94a3b8;">
            &copy; ${year} Seazone Investimentos &middot; Qualquer dúvida, responda a este e-mail.
          </p>
        </td></tr>

      </table>
    </td></tr>
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
    // await requireAdmin(req);
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (!data.closer_id) return json({ error: "Campo obrigatório ausente: closer_id" }, 400);
    const err = validateSlotData(data, true);
    if (err) return json({ error: err }, 400);
    const { data: created, error } = await supabase.from("webinar_slots").insert(data).select().single();
    if (error) return json({ error: error.message }, 500);
    return json(created, 201);
  }

  if (method === "PUT" && slotId) {
    // await requireAdmin(req);
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    const err = validateSlotData(data, false);
    if (err) return json({ error: err }, 400);
    if (data.is_active === false) await cascadeDeactivateSlot(supabase, slotId);
    const { data: updated, error } = await supabase.from("webinar_slots").update(data).eq("id", slotId).select().single();
    if (error) return json({ error: error.message }, 500);
    return json(updated);
  }

  if (method === "DELETE" && slotId) {
    // await requireAdmin(req);
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
      // await requireAdmin(req);
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

    let q = supabase.from("webinar_sessions").select("*, webinar_registrations(count)").order("date").order("starts_at");
    if (dateFrom) q = q.gte("date", dateFrom);
    if (dateTo) q = q.lte("date", dateTo);
    if (status) q = q.eq("status", status);
    if (closerId) q = q.eq("closer_id", closerId);
    const { data } = await q;
    const sessions = (data || []).map((s: Record<string, unknown>) => {
      const regs = s.webinar_registrations as { count: number }[] | undefined;
      const count = regs?.[0]?.count ?? 0;
      const { webinar_registrations: _r, ...rest } = s;
      return { ...rest, registration_count: count };
    });
    return json(sessions);
  }

  // POST /sessions (admin)
  if (method === "POST") {
    // await requireAdmin(req);
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

  // POST /registrations/external (public form: creates Pipedrive deal + registration)
  if (method === "POST" && segments[0] === "external") {
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    const required = ["session_id", "name", "email", "phone", "cidade", "closer_slug"];
    const missing = required.filter((f) => !data[f]);
    if (missing.length) return json({ error: `Campos obrigatórios ausentes: ${missing.join(", ")}` }, 400);

    const sessionId = data.session_id as string;
    const name = (data.name as string).trim();
    const email = (data.email as string).toLowerCase().trim();
    const phone = (data.phone as string).trim();
    const cidade = (data.cidade as string).trim();
    const closerSlug = data.closer_slug as string;

    // Validate session and closer
    const { data: session } = await supabase.from("webinar_sessions").select("*, webinar_closers(*)").eq("id", sessionId).maybeSingle();
    if (!session) return json({ error: "Sessão não encontrada" }, 404);
    const s = session as Record<string, unknown>;
    if (s.status === "cancelled") return json({ error: "Sessão cancelada" }, 409);
    const closer = s.webinar_closers as Record<string, unknown> | null;
    if (!closer || closer.slug !== closerSlug) return json({ error: "Closer inválido para esta sessão" }, 400);
    const closerEmail = closer.email as string;

    // Check duplicate
    const { data: existingRegs } = await supabase
      .from("webinar_registrations")
      .select("id, session_id, access_token")
      .eq("email", email)
      .is("cancelled_at", null);
    if (existingRegs && existingRegs.length > 0) {
      const sameSession = existingRegs.find((r: Record<string, unknown>) => r.session_id === sessionId);
      if (sameSession) {
        const roomUrl = `${FRONTEND_URL}/webinar/sala/${sessionId}?token=${sameSession.access_token}`;
        return json({ already_registered: true, room_url: roomUrl, message: "Você já está inscrito nesta sessão." });
      }
      const otherSessionId = existingRegs[0].session_id as string;
      const { data: otherSession } = await supabase.from("webinar_sessions").select("date, starts_at").eq("id", otherSessionId).maybeSingle();
      return json({
        has_existing: true,
        existing_session_id: otherSessionId,
        existing_registration_id: existingRegs[0].id,
        existing_starts_at: otherSession ? (otherSession as Record<string, unknown>).starts_at as string : null,
        message: "Você já possui um agendamento. Deseja reagendar para este horário?",
      }, 409);
    }

    // 1. Find Pipedrive owner (closer) user ID
    const ownerId = await pipedriveFindUserByEmail(closerEmail);
    if (!ownerId) return json({ error: `Closer ${closerEmail} não encontrado no Pipedrive` }, 500);

    // 2. Create/find Person
    const personResult = await pipedriveFindOrCreatePerson(name, email, phone);
    if (!personResult.ok || !personResult.person_id) {
      return json({ error: `Erro ao criar contato no Pipedrive: ${personResult.error}` }, 500);
    }

    // 3. Create Deal
    const dealTitle = `[webinar] ${name} - ${cidade}`;
    const dealResult = await pipedriveCreateWebinarDeal(dealTitle, personResult.person_id, ownerId);
    if (!dealResult.ok || !dealResult.deal_id) {
      return json({ error: `Erro ao criar deal no Pipedrive: ${dealResult.error}` }, 500);
    }

    // 4. Create registration with deal URL + cidade
    const insertPayload: Record<string, unknown> = {
      session_id: sessionId,
      name,
      email,
      phone,
      pipedrive_deal_url: dealResult.deal_url,
      cidade,
    };
    const { data: reg, error: regErr } = await supabase.from("webinar_registrations").insert(insertPayload).select().single();
    if (regErr) return json({ error: regErr.message, pipedrive_deal_id: dealResult.deal_id }, 500);

    const roomUrl = `${FRONTEND_URL}/webinar/sala/${sessionId}?token=${reg.access_token}`;

    // 5. Send confirmation email
    try {
      const startsAt = (s.starts_at as string) || new Date().toISOString();
      const senderName = (closer.name as string) || "Seazone";
      const html = buildConfirmationEmail(name, senderName, startsAt, roomUrl, null);
      await sendEmail(senderName, email, "Seu agendamento na Seazone está confirmado!", html);
    } catch (err) {
      console.error("[webinar-api] email failed (external reg):", err);
    }

    return json({
      access_token: reg.access_token,
      room_url: roomUrl,
      registration: reg,
      pipedrive_deal_id: dealResult.deal_id,
      pipedrive_deal_url: dealResult.deal_url,
    }, 201);
  }

  // POST /registrations/reschedule
  if (method === "POST" && segments[0] === "reschedule") {
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;
    const registrationId = data.registration_id as string;
    const newSessionId = data.new_session_id as string;
    if (!registrationId || !newSessionId) return json({ error: "Campos registration_id e new_session_id são obrigatórios" }, 400);

    // Cancel old registration
    const now = new Date().toISOString();
    await supabase.from("webinar_registrations").update({ cancelled_at: now }).eq("id", registrationId);

    // Get old registration data for the new one
    const { data: oldReg } = await supabase.from("webinar_registrations").select("*").eq("id", registrationId).single();
    if (!oldReg) return json({ error: "Inscrição não encontrada" }, 404);
    const old = oldReg as Record<string, unknown>;

    // Create new registration
    const { data: newReg, error } = await supabase.from("webinar_registrations").insert({
      session_id: newSessionId,
      name: old.name,
      email: old.email,
      phone: old.phone,
      pipedrive_deal_url: old.pipedrive_deal_url,
    }).select().single();
    if (error) return json({ error: error.message }, 500);

    const roomUrl = `${FRONTEND_URL}/webinar/sala/${newSessionId}?token=${newReg.access_token}`;

    // Send confirmation email for the new session
    try {
      const { data: newSession } = await supabase.from("webinar_sessions").select("starts_at, closer_id").eq("id", newSessionId).single();
      let closerName = "Seazone";
      if (newSession?.closer_id) {
        const { data: cl } = await supabase.from("webinar_closers").select("name").eq("id", newSession.closer_id).maybeSingle();
        if (cl) closerName = (cl as Record<string, unknown>).name as string;
      }
      const startsAt = (newSession as Record<string, unknown>)?.starts_at as string || new Date().toISOString();
      const preSeller = await pipedriveGetPreSeller(old.pipedrive_deal_url as string | null);
      const htmlBody = buildConfirmationEmail(old.name as string, closerName, startsAt, roomUrl, preSeller?.name);
      await sendEmail(closerName, old.email as string, "Seu agendamento na Seazone foi reagendado!", htmlBody);
      console.log(`[webinar-api] Reschedule confirmation email sent to ${old.email}`);
      if (preSeller?.email) {
        await sendEmail(closerName, preSeller.email, `[Webinar] ${old.name} reagendou`, htmlBody);
        console.log(`[webinar-api] Pre-seller reschedule copy sent to ${preSeller.email}`);
      }
    } catch (emailErr) {
      console.error("[webinar-api] Failed to send reschedule email:", emailErr);
    }

    return json({ ...newReg, room_url: roomUrl });
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

    // Check if email already has an active registration
    const email = (data.email as string).toLowerCase().trim();
    const { data: existingRegs } = await supabase
      .from("webinar_registrations")
      .select("id, session_id, access_token")
      .eq("email", email)
      .is("cancelled_at", null);

    if (existingRegs && existingRegs.length > 0) {
      const sameSession = existingRegs.find((r: Record<string, unknown>) => r.session_id === sessionId);
      if (sameSession) {
        // Already registered for this exact session — return existing token
        const roomUrl = `${FRONTEND_URL}/webinar/sala/${sessionId}?token=${sameSession.access_token}`;
        return json({ already_registered: true, room_url: roomUrl, message: "Você já está inscrito nesta sessão." });
      }
      // Has registration for a different session — offer reschedule
      const otherSessionId = existingRegs[0].session_id as string;
      const { data: otherSession } = await supabase.from("webinar_sessions").select("date, starts_at").eq("id", otherSessionId).maybeSingle();
      const existingDate = otherSession ? (otherSession as Record<string, unknown>).starts_at as string : null;
      return json({
        has_existing: true,
        existing_session_id: otherSessionId,
        existing_registration_id: existingRegs[0].id,
        existing_starts_at: existingDate,
        message: "Você já possui um agendamento. Deseja reagendar para este horário?",
      }, 409);
    }

    // Let the DB generate access_token (uuid DEFAULT gen_random_uuid())
    const insertPayload: Record<string, unknown> = {
      session_id: sessionId,
      name: data.name,
      email: email,
      phone: data.phone,
    };
    if (data.pipedrive_deal_url) insertPayload.pipedrive_deal_url = data.pipedrive_deal_url;
    if (data.cidade) insertPayload.cidade = data.cidade;
    if (data.tipo_imovel) insertPayload.tipo_imovel = data.tipo_imovel;

    const { data: reg, error } = await supabase.from("webinar_registrations").insert(insertPayload).select().single();
    if (error) return json({ error: error.message }, 500);

    const roomUrl = `${FRONTEND_URL}/webinar/sala/${sessionId}?token=${reg.access_token}`;

    // Send confirmation email — best-effort (do not fail registration if email fails)
    try {
      const senderName = (closer?.name as string) || "Gabriela Lemos";
      const startsAt = (s.starts_at as string) || new Date().toISOString();
      const preSeller = await pipedriveGetPreSeller(data.pipedrive_deal_url as string | null);
      const htmlBody = buildConfirmationEmail(data.name as string, senderName, startsAt, roomUrl, preSeller?.name);
      const subject = "Seu agendamento na Seazone está confirmado!";
      await sendEmail(senderName, data.email as string, subject, htmlBody);
      console.log(`[webinar-api] Confirmation email sent to ${data.email}`);
      // Send copy to pre-seller
      if (preSeller?.email) {
        await sendEmail(senderName, preSeller.email, `[Webinar] ${data.name} confirmou agendamento`, htmlBody);
        console.log(`[webinar-api] Pre-seller copy sent to ${preSeller.email}`);
      }
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
    // await requireAdmin(req);
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
  // await requireAdmin(req);

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

  // POST /admin/sessions/:id/mark-no-shows (bulk mark no-shows + move Pipedrive deals)
  if (method === "POST" && segments[0] === "sessions" && segments[2] === "mark-no-shows") {
    const sessionId = segments[1];

    // Verify session exists and is ended
    const { data: sess } = await supabase
      .from("webinar_sessions")
      .select("id, status")
      .eq("id", sessionId)
      .maybeSingle();
    if (!sess) return json({ error: "Sessão não encontrada" }, 404);

    // Get all registrations that are "Confirmado" (no attended_at, no cancelled_at, no no_show_at)
    const { data: regs } = await supabase
      .from("webinar_registrations")
      .select("id, name, pipedrive_deal_url")
      .eq("session_id", sessionId)
      .is("attended_at", null)
      .is("cancelled_at", null)
      .is("no_show_at", null);

    if (!regs || regs.length === 0) {
      return json({ ok: true, marked: 0, results: [] });
    }

    const now = new Date().toISOString();
    const results: { id: string; name: string; db_ok: boolean; pipedrive?: { ok: boolean; moved?: boolean; error?: string } }[] = [];

    for (const reg of regs) {
      const r = reg as Record<string, unknown>;
      // Update no_show_at in DB
      const { error: dbErr } = await supabase
        .from("webinar_registrations")
        .update({ no_show_at: now })
        .eq("id", r.id);

      const entry: typeof results[0] = { id: r.id as string, name: r.name as string, db_ok: !dbErr };

      // Move deal to No Show stage in Pipedrive
      const dealId = extractDealId(r.pipedrive_deal_url as string | null);
      if (dealId) {
        const pdResult = await pipedriveMoveDealToNoShow(dealId);
        entry.pipedrive = pdResult;
        console.log(`[webinar-api] No Show: deal ${dealId} for ${r.name}:`, pdResult);
      }

      results.push(entry);
    }

    return json({ ok: true, marked: results.length, results });
  }

  // GET /admin/registrations (all)
  if (method === "GET" && segments[0] === "registrations" && !segments[1]) {
    const { data } = await supabase
      .from("webinar_registrations")
      .select("*")
      .is("cancelled_at", null)
      .order("created_at", { ascending: false });
    return json(data || []);
  }

  // POST /admin/registrations/:id/sync-transcript (fetch Fireflies + sync to Pipedrive)
  if (method === "POST" && segments[0] === "registrations" && segments[1] && segments[2] === "sync-transcript") {
    const registrationId = segments[1];

    const { data: reg } = await supabase
      .from("webinar_registrations")
      .select("*, webinar_sessions(*, webinar_closers(email, name))")
      .eq("id", registrationId)
      .maybeSingle();
    if (!reg) return json({ error: "Inscrição não encontrada" }, 404);

    const r = reg as Record<string, unknown>;
    const sess = r.webinar_sessions as Record<string, unknown> | null;
    if (!sess) return json({ error: "Sessão não encontrada" }, 404);
    const closer = sess.webinar_closers as Record<string, unknown> | null;
    const closerEmail = (closer?.email as string) || "";
    const regCidade = (r.cidade as string) || null;
    if (!closerEmail) return json({ error: "Closer sem email configurado" }, 400);

    try {
      const meetLink = sess.google_meet_link as string | null;
      const meetCode = extractMeetCode(meetLink);

      // Search Drive for a transcript/notes doc matching this session
      const file = await driveSearchTranscriptDoc(sess.starts_at as string, meetCode, regCidade, r.name as string);
      if (!file) {
        return json({
          ok: false,
          error: `Nenhum documento encontrado para "${regCidade || "cidade não definida"}" + "${r.name || "lead"}" no período da sessão. Verifique se a reunião foi gravada/transcrita e se a cidade do inscrito está preenchida para desambiguar.`,
        });
      }

      const docText = await driveFetchTextFromFile(file);
      if (!docText.trim()) {
        return json({ ok: false, error: "Documento encontrado mas está vazio.", file_id: file.id, file_name: file.name });
      }

      const note = buildDriveTranscriptNote(file, docText, r.name as string, sess.starts_at as string);

      // Sync to Pipedrive
      const dealId = extractDealId(r.pipedrive_deal_url as string | null);
      let pipedriveResult: { ok: boolean; error?: string; note_id?: number } = { ok: false, error: "no deal url" };
      if (dealId) {
        pipedriveResult = await pipedriveCreateNote(dealId, note);
      }

      const preview = docText.slice(0, 500);
      await supabase.from("webinar_registrations").update({
        fireflies_transcript_id: file.id,
        transcript_summary: preview,
        transcript_synced_at: new Date().toISOString(),
        pipedrive_transcript_note_id: pipedriveResult.note_id || null,
      }).eq("id", registrationId);

      return json({
        ok: true,
        source: "google_drive",
        file_id: file.id,
        file_name: file.name,
        doc_url: `https://docs.google.com/document/d/${file.id}`,
        pipedrive: pipedriveResult,
      });
    } catch (err) {
      return json({ ok: false, error: (err as Error).message }, 500);
    }
  }

  // PATCH /admin/registrations/:id (update observacoes + is_opportunity)
  if (method === "PATCH" && segments[0] === "registrations" && segments[1]) {
    const registrationId = segments[1];
    const data = await req.json().catch(() => ({})) as Record<string, unknown>;

    // Fetch current registration to compare
    const { data: existing } = await supabase
      .from("webinar_registrations")
      .select("*")
      .eq("id", registrationId)
      .maybeSingle();
    if (!existing) return json({ error: "Inscrição não encontrada" }, 404);
    const reg = existing as Record<string, unknown>;

    const updateData: Record<string, unknown> = {};
    if ("observacoes" in data) updateData.observacoes = data.observacoes;
    if ("cidade" in data) updateData.cidade = data.cidade;
    if ("tipo_imovel" in data) updateData.tipo_imovel = data.tipo_imovel;
    if ("is_opportunity" in data) {
      updateData.is_opportunity = data.is_opportunity;
      if (data.is_opportunity === true && reg.is_opportunity !== true) {
        updateData.opportunity_marked_at = new Date().toISOString();
      }
    }
    if (Object.keys(updateData).length === 0) return json({ error: "Nenhum campo para atualizar" }, 400);

    const { data: updated, error } = await supabase
      .from("webinar_registrations")
      .update(updateData)
      .eq("id", registrationId)
      .select()
      .single();
    if (error) return json({ error: error.message }, 500);

    // Pipedrive side-effects (best-effort, don't fail PATCH)
    const pipedriveResults: Record<string, unknown> = {};
    const dealId = extractDealId(reg.pipedrive_deal_url as string | null);

    if (dealId) {
      // Move stage if marked as opportunity (and wasn't before)
      if (data.is_opportunity === true && reg.is_opportunity !== true) {
        const stageResult = await pipedriveMoveDealStage(dealId);
        pipedriveResults.stage_move = stageResult;
        console.log(`[webinar-api] Pipedrive move stage for deal ${dealId}:`, stageResult);
      }
      // Create note if observacoes was set/changed and not empty
      if ("observacoes" in data && data.observacoes && data.observacoes !== reg.observacoes) {
        const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const closerName = (reg.name as string) || "Inscrito";
        const noteContent = `<h3>📝 Observações do Webinar</h3><p><strong>Inscrito:</strong> ${closerName}</p><p><strong>Atualizado em:</strong> ${now}</p><hr/><p>${(data.observacoes as string).replace(/\n/g, "<br/>")}</p>`;
        const noteResult = await pipedriveCreateNote(dealId, noteContent);
        pipedriveResults.note_created = noteResult;
        console.log(`[webinar-api] Pipedrive note for deal ${dealId}:`, noteResult);
      }
    }

    return json({ ...updated, _pipedrive: pipedriveResults });
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

// ── Google Drive transcript helpers (SA self-auth, no DWD) ────────────────────

async function getDriveAccessToken(): Promise<string> {
  const credsJson = Deno.env.get("GOOGLE_CALENDAR_CREDENTIALS");
  if (!credsJson) throw new Error("GOOGLE_CALENDAR_CREDENTIALS not set");
  const creds = JSON.parse(credsJson);
  const privateKey = await importPrivateKey(creds.private_key);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: creds.client_email,
    // No `sub` → SA acts as itself (no impersonation, no DWD needed)
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = new TextEncoder();
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, enc.encode(unsigned));
  const jwt = `${unsigned}.${base64url(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Drive OAuth: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

type DriveFile = { id: string; name: string; modifiedTime: string; mimeType: string };

const MIME_GDOC = "application/vnd.google-apps.document";
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function normalizeStr(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function driveSearchTranscriptDoc(
  sessionStartsAt: string,
  meetCode: string | null,
  slotCidade: string | null,
  leadName: string | null,
): Promise<DriveFile | null> {
  const accessToken = await getDriveAccessToken();
  const sessionDate = new Date(sessionStartsAt);
  const fromIso = new Date(sessionDate.getTime() - 6 * 60 * 60 * 1000).toISOString();
  const toIso = new Date(sessionDate.getTime() + 8 * 60 * 60 * 1000).toISOString();

  const mimeClause = `(mimeType='${MIME_GDOC}' or mimeType='${MIME_DOCX}')`;
  const qParts = [
    mimeClause,
    `modifiedTime > '${fromIso}'`,
    `modifiedTime < '${toIso}'`,
    `trashed = false`,
  ];
  const q = encodeURIComponent(qParts.join(" and "));
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime,parents)&orderBy=modifiedTime desc&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive search: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const files: DriveFile[] = data.files || [];
  if (files.length === 0) return null;

  const sessionIsoBasic = sessionDate.toISOString().split(".")[0];
  const sessionDateFragment = sessionIsoBasic.replace(/:/g, "-");
  const cidadeNorm = slotCidade ? normalizeStr(slotCidade) : null;
  const leadFirstName = leadName ? normalizeStr(leadName.split(/[\s,]+/)[0]) : null;
  const leadTokens = leadName ? leadName.split(/[\s,]+/).map(normalizeStr).filter((t) => t.length >= 3) : [];

  const scored = files.map((f) => {
    const nRaw = f.name;
    const n = normalizeStr(nRaw);
    let score = 0;
    // Timestamp match (good but not unique)
    if (nRaw.includes(sessionDateFragment)) score += 50;
    // Meet code if present
    if (meetCode && n.includes(meetCode.toLowerCase())) score += 100;
    // Cidade match (most important disambiguator when multiple meetings happen at same time)
    if (cidadeNorm && n.includes(cidadeNorm)) score += 150;
    // Lead name match (first name or any token ≥3 chars)
    if (leadFirstName && n.includes(leadFirstName)) score += 120;
    for (const tok of leadTokens) {
      if (tok !== leadFirstName && n.includes(tok)) score += 40;
    }
    // Prefer transcripts
    if (n.includes("transcript") || n.includes("transcricao")) score += 30;
    if (n.includes("notes") || n.includes("notas")) score += 20;
    if (f.mimeType === MIME_GDOC) score += 5;
    // Time proximity (small penalty)
    const timeDiff = Math.abs(new Date(f.modifiedTime).getTime() - sessionDate.getTime());
    score -= Math.min(timeDiff / (60 * 60 * 1000), 15);
    return { file: f, score };
  }).sort((a, b) => b.score - a.score);

  // Require at least cidade OR lead name to match, otherwise we'd just pick a random meeting
  const minScoreThreshold = (cidadeNorm || leadFirstName) ? 100 : 50;
  if (scored[0].score < minScoreThreshold) return null;
  return scored[0].file;
}

async function driveFetchTextFromFile(file: DriveFile): Promise<string> {
  const accessToken = await getDriveAccessToken();

  if (file.mimeType === MIME_GDOC) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Drive export: ${res.status} ${await res.text()}`);
    return await res.text();
  }

  if (file.mimeType === MIME_DOCX) {
    // Download raw .docx bytes
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Drive download: ${res.status} ${await res.text()}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return await extractTextFromDocx(bytes);
  }

  throw new Error(`Unsupported mimeType: ${file.mimeType}`);
}

async function extractTextFromDocx(bytes: Uint8Array): Promise<string> {
  // .docx is a ZIP containing word/document.xml. We read that XML and extract <w:t> text runs.
  const { BlobReader, ZipReader, TextWriter } = await import("https://deno.land/x/zipjs@v2.7.45/index.js");
  const reader = new ZipReader(new BlobReader(new Blob([bytes as BlobPart])));
  const entries = await reader.getEntries();
  const docEntry = entries.find((e: { filename: string }) => e.filename === "word/document.xml");
  if (!docEntry) {
    await reader.close();
    throw new Error("docx: word/document.xml não encontrado");
  }
  const xml = await docEntry.getData(new TextWriter());
  await reader.close();
  // Extract text: runs of <w:t>text</w:t> joined by spaces; <w:p> paragraphs by newline
  const paragraphs = xml.split(/<\/w:p>/).map((p: string) => {
    const texts = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    return texts.join("").trim();
  }).filter((t: string) => t.length > 0);
  return paragraphs.join("\n");
}

function buildDriveTranscriptNote(
  file: DriveFile,
  docText: string,
  leadName: string,
  sessionStartsAt: string,
): string {
  const dateStr = new Date(sessionStartsAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const MAX = 8000;
  let body = docText.trim();
  let truncated = false;
  if (body.length > MAX) {
    body = body.slice(0, MAX) + "…";
    truncated = true;
  }
  const bodyHtml = body.split("\n").map((l) => l.trim() ? `<p style="margin:4px 0;">${l}</p>` : "<br/>").join("");
  const docUrl = file.mimeType === MIME_GDOC
    ? `https://docs.google.com/document/d/${file.id}`
    : `https://drive.google.com/file/d/${file.id}/view`;
  return `<h3>🎙️ Transcrição / Notas da Reunião</h3>
<p><strong>Inscrito:</strong> ${leadName}</p>
<p><strong>Data da sessão:</strong> ${dateStr}</p>
<p><strong>Arquivo:</strong> <a href="${docUrl}">${file.name}</a></p>
<hr/>
<div style="font-size:13px;">${bodyHtml}</div>
${truncated ? "<hr/><p style=\"font-size:11px;color:#777;\">Conteúdo truncado (limite 8000 caracteres). <a href=\"" + docUrl + "\">Ver documento completo</a>.</p>" : ""}
<p style="font-size:11px;color:#777;">Fonte: Google Drive — ${file.id}</p>`;
}

// ── Google Meet transcript helpers ────────────────────────────────────────────

async function getMeetAccessToken(hostEmail: string): Promise<string> {
  const credsJson = Deno.env.get("GOOGLE_CALENDAR_CREDENTIALS");
  if (!credsJson) throw new Error("GOOGLE_CALENDAR_CREDENTIALS not set");
  const creds = JSON.parse(credsJson);
  const privateKey = await importPrivateKey(creds.private_key);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: creds.client_email,
    sub: hostEmail,
    scope: "https://www.googleapis.com/auth/meetings.space.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = new TextEncoder();
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, enc.encode(unsigned));
  const jwt = `${unsigned}.${base64url(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Meet OAuth: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

function extractMeetCode(meetLink: string | null | undefined): string | null {
  if (!meetLink) return null;
  const m = meetLink.match(/meet\.google\.com\/([a-z0-9-]+)/i);
  return m ? m[1] : null;
}

async function googleMeetFindTranscript(
  meetLink: string | null | undefined,
  hostEmail: string,
  sessionStartsAt: string,
): Promise<{
  title: string;
  transcript_id: string;
  conference_name: string;
  full_text: string;
  summary_preview: string;
  participants: string[];
  duration_min: number;
  start_time: string;
} | null> {
  const meetCode = extractMeetCode(meetLink);
  if (!meetCode) return null;

  const accessToken = await getMeetAccessToken(hostEmail);
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // Get space
  const spaceRes = await fetch(`https://meet.googleapis.com/v2/spaces/${meetCode}`, { headers: authHeader });
  if (spaceRes.status === 404) return null;
  if (!spaceRes.ok) throw new Error(`Meet spaces: ${spaceRes.status} ${await spaceRes.text()}`);
  const space = await spaceRes.json();
  const spaceName = space.name as string; // "spaces/{id}"

  // List conference records for this space
  const filter = encodeURIComponent(`space.name="${spaceName}"`);
  const confRes = await fetch(`https://meet.googleapis.com/v2/conferenceRecords?filter=${filter}`, { headers: authHeader });
  if (!confRes.ok) throw new Error(`Meet conferences: ${confRes.status} ${await confRes.text()}`);
  const conferences: Record<string, unknown>[] = (await confRes.json()).conferenceRecords || [];
  if (conferences.length === 0) return null;

  // Pick conference closest to session start
  const sessT = new Date(sessionStartsAt).getTime();
  const conference = conferences.sort((a, b) => {
    const ta = Math.abs(new Date(a.startTime as string).getTime() - sessT);
    const tb = Math.abs(new Date(b.startTime as string).getTime() - sessT);
    return ta - tb;
  })[0];

  // List transcripts
  const transRes = await fetch(`https://meet.googleapis.com/v2/${conference.name}/transcripts`, { headers: authHeader });
  if (!transRes.ok) return null;
  const transcripts: Record<string, unknown>[] = (await transRes.json()).transcripts || [];
  if (transcripts.length === 0) return null;
  const transcript = transcripts[0];

  // Fetch participants to map resource names to user emails/names
  const partRes = await fetch(`https://meet.googleapis.com/v2/${conference.name}/participants`, { headers: authHeader });
  const participantsList: Record<string, unknown>[] = partRes.ok ? ((await partRes.json()).participants || []) : [];
  const partMap: Record<string, string> = {};
  const participantLabels: string[] = [];
  for (const p of participantsList) {
    const name = p.name as string;
    const user = (p.signedinUser || p.anonymousUser || p.phoneUser) as Record<string, unknown> | undefined;
    const label = (user?.displayName as string) || (user?.email as string) || (user?.user as string) || `Participante`;
    partMap[name] = label;
    participantLabels.push(label);
  }

  // Fetch transcript entries (paginate)
  const entries: Record<string, unknown>[] = [];
  let pageToken = "";
  for (let i = 0; i < 5; i++) {
    const url = `https://meet.googleapis.com/v2/${transcript.name}/entries?pageSize=500${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const er = await fetch(url, { headers: authHeader });
    if (!er.ok) break;
    const ej = await er.json();
    for (const e of (ej.transcriptEntries || [])) entries.push(e);
    pageToken = ej.nextPageToken || "";
    if (!pageToken) break;
  }

  // Build full text with speaker labels
  const lines = entries.map((e) => {
    const speaker = partMap[e.participant as string] || "Participante";
    return `${speaker}: ${(e.text as string || "").trim()}`;
  });
  const fullText = lines.join("\n");

  // Duration
  const startTime = conference.startTime as string;
  const endTime = (conference.endTime as string) || new Date().toISOString();
  const durMin = Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000);

  // Simple preview (first ~400 chars)
  const preview = fullText.slice(0, 400);

  return {
    title: `Reunião ${new Date(startTime).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    transcript_id: transcript.name as string,
    conference_name: conference.name as string,
    full_text: fullText,
    summary_preview: preview,
    participants: participantLabels,
    duration_min: durMin,
    start_time: startTime,
  };
}

function buildGoogleMeetNote(t: NonNullable<Awaited<ReturnType<typeof googleMeetFindTranscript>>>, leadName: string): string {
  const dateStr = new Date(t.start_time).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const participants = t.participants.slice(0, 10).join(", ");
  // Limit transcript body to ~8000 chars for Pipedrive
  const MAX = 8000;
  let body = t.full_text;
  let truncated = false;
  if (body.length > MAX) {
    body = body.slice(0, MAX) + "…";
    truncated = true;
  }
  const bodyHtml = body.split("\n").map((l) => `<p style="margin:4px 0;">${l}</p>`).join("");
  return `<h3>🎙️ Transcrição da Reunião (Google Meet)</h3>
<p><strong>Inscrito:</strong> ${leadName}</p>
<p><strong>Data:</strong> ${dateStr} · <strong>Duração:</strong> ${t.duration_min} min</p>
<p><strong>Participantes:</strong> ${participants}</p>
<hr/>
<div style="max-height:400px;overflow-y:auto;font-size:13px;">${bodyHtml}</div>
${truncated ? "<hr/><p style=\"font-size:11px;color:#777;\">Transcrição truncada (limite 8000 caracteres). Consulte o Google Meet para a transcrição completa.</p>" : ""}
<p style="font-size:11px;color:#777;">Fonte: Google Meet — ${t.transcript_id}</p>`;
}

// ── Fireflies helpers ─────────────────────────────────────────────────────────

async function firefliesFindTranscript(sessionStartsAt: string, closerEmail: string, participantEmail: string): Promise<Record<string, unknown> | null> {
  const apiKey = Deno.env.get("FIREFLIES_API_KEY");
  if (!apiKey) return null;

  // Search window: ±2h around session start
  const sessionDate = new Date(sessionStartsAt);
  const fromDate = new Date(sessionDate.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const toDate = new Date(sessionDate.getTime() + 3 * 60 * 60 * 1000).toISOString();

  const query = `{
    transcripts(
      fromDate: "${fromDate}"
      toDate: "${toDate}"
      limit: 50
    ) {
      id title dateString duration participants
      summary { overview short_summary action_items keywords }
    }
  }`;

  const resp = await fetch("https://api.fireflies.ai/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) {
    throw new Error(`Fireflies API error: ${resp.status} ${await resp.text()}`);
  }
  const json = await resp.json();
  const transcripts: Record<string, unknown>[] = json?.data?.transcripts || [];

  // Match: closer email in participants + inscrito email in participants (preferred)
  // Fallback: closer email only (if inscrito didn't use the same email)
  const norm = (e: string) => e.toLowerCase().trim();
  const closerNorm = norm(closerEmail);
  const partNorm = norm(participantEmail);

  const withBoth = transcripts.find((t) => {
    const parts = (t.participants as string[] || []).map(norm);
    return parts.includes(closerNorm) && parts.includes(partNorm);
  });
  if (withBoth) return withBoth;

  // Fallback: closer-only match, closest in time
  const withCloser = transcripts
    .filter((t) => (t.participants as string[] || []).map(norm).includes(closerNorm))
    .sort((a, b) => {
      const dA = Math.abs(new Date(a.dateString as string).getTime() - sessionDate.getTime());
      const dB = Math.abs(new Date(b.dateString as string).getTime() - sessionDate.getTime());
      return dA - dB;
    });
  return withCloser[0] || null;
}

function buildTranscriptNote(transcript: Record<string, unknown>, leadName: string): string {
  const summary = transcript.summary as Record<string, unknown> | null;
  const title = transcript.title || "Reunião";
  const duration = transcript.duration ? `${Math.round(transcript.duration as number)} min` : "—";
  const dateStr = new Date(transcript.dateString as string).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const overview = (summary?.overview as string) || "";
  const shortSummary = (summary?.short_summary as string) || "";
  const actionItems = (summary?.action_items as string) || "";
  const keywords = (summary?.keywords as string[] | string) || "";
  const kwStr = Array.isArray(keywords) ? keywords.join(", ") : keywords;

  const htmlOverview = overview.replace(/\n/g, "<br/>");
  const htmlActions = actionItems.replace(/\n/g, "<br/>");

  return `<h3>🎙️ Resumo da Reunião — ${title}</h3>
<p><strong>Inscrito:</strong> ${leadName}</p>
<p><strong>Data:</strong> ${dateStr} · <strong>Duração:</strong> ${duration}</p>
${kwStr ? `<p><strong>Palavras-chave:</strong> ${kwStr}</p>` : ""}
<hr/>
${shortSummary ? `<p><strong>Resumo:</strong> ${shortSummary}</p>` : ""}
${overview ? `<p><strong>Pontos principais:</strong></p><p>${htmlOverview}</p>` : ""}
${actionItems ? `<hr/><p><strong>Ações acordadas:</strong></p><p>${htmlActions}</p>` : ""}
<hr/><p style="font-size:11px;color:#777;">Fonte: Fireflies (transcript ${transcript.id})</p>`;
}

// ── Pipedrive helpers ─────────────────────────────────────────────────────────

const PIPEDRIVE_DOMAIN = "seazone-fd92b9";
const SZS_PIPELINE_ID = 14;
const SZS_STAGE_REUNIAO_REALIZADA = 151;
const SZS_STAGE_NO_SHOW = 342;
const PRE_SELLER_FIELD_KEY = "34a7f4f5f78e8a8d4751ddfb3cfcfb224d8ff908";

function extractDealId(dealUrl: string | null | undefined): number | null {
  if (!dealUrl) return null;
  const match = dealUrl.match(/\/deal\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

async function pipedriveMoveDealStage(dealId: number): Promise<{ ok: boolean; error?: string; moved?: boolean; pipeline_id?: number }> {
  const token = Deno.env.get("PIPEDRIVE_API_TOKEN");
  if (!token) return { ok: false, error: "PIPEDRIVE_API_TOKEN not set" };
  try {
    // Fetch deal to check pipeline
    const dealResp = await fetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/deals/${dealId}?api_token=${token}`);
    if (!dealResp.ok) return { ok: false, error: `Fetch deal failed: ${dealResp.status}` };
    const dealData = await dealResp.json();
    const pipelineId = dealData?.data?.pipeline_id;
    if (pipelineId !== SZS_PIPELINE_ID) {
      return { ok: true, moved: false, pipeline_id: pipelineId };
    }
    // Update stage
    const updateResp = await fetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/deals/${dealId}?api_token=${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: SZS_STAGE_REUNIAO_REALIZADA }),
    });
    if (!updateResp.ok) {
      const err = await updateResp.text();
      return { ok: false, error: `Update stage failed: ${updateResp.status} ${err}` };
    }
    return { ok: true, moved: true, pipeline_id: pipelineId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function pipedriveMoveDealToNoShow(dealId: number): Promise<{ ok: boolean; error?: string; moved?: boolean; pipeline_id?: number }> {
  const token = Deno.env.get("PIPEDRIVE_API_TOKEN");
  if (!token) return { ok: false, error: "PIPEDRIVE_API_TOKEN not set" };
  try {
    const dealResp = await fetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/deals/${dealId}?api_token=${token}`);
    if (!dealResp.ok) return { ok: false, error: `Fetch deal failed: ${dealResp.status}` };
    const dealData = await dealResp.json();
    const pipelineId = dealData?.data?.pipeline_id;
    if (pipelineId !== SZS_PIPELINE_ID) {
      return { ok: true, moved: false, pipeline_id: pipelineId };
    }
    const updateResp = await fetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/deals/${dealId}?api_token=${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: SZS_STAGE_NO_SHOW }),
    });
    if (!updateResp.ok) {
      const err = await updateResp.text();
      return { ok: false, error: `Update stage failed: ${updateResp.status} ${err}` };
    }
    return { ok: true, moved: true, pipeline_id: pipelineId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const SZS_STAGE_AGENDADO = 73;

async function pipedriveGetPreSeller(dealUrl: string | null | undefined): Promise<{ name: string; email: string } | null> {
  const dealId = extractDealId(dealUrl);
  if (!dealId) return null;
  const token = Deno.env.get("PIPEDRIVE_API_TOKEN");
  if (!token) return null;
  try {
    const resp = await fetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/deals/${dealId}?api_token=${token}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const preSellerUserId = data?.data?.[PRE_SELLER_FIELD_KEY];
    if (!preSellerUserId) return null;
    const userResp = await fetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/users/${preSellerUserId}?api_token=${token}`);
    if (!userResp.ok) return null;
    const userData = await userResp.json();
    const name = userData?.data?.name as string | undefined;
    const email = userData?.data?.email as string | undefined;
    if (!name || !email) return null;
    return { name, email };
  } catch {
    return null;
  }
}

async function pipedriveFindUserByEmail(email: string): Promise<number | null> {
  const token = Deno.env.get("PIPEDRIVE_API_TOKEN");
  if (!token) return null;
  const resp = await fetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/users?api_token=${token}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  const users = (data?.data || []) as Array<{ id: number; email: string }>;
  const match = users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  return match?.id ?? null;
}

async function pipedriveFindOrCreatePerson(name: string, email: string, phone: string): Promise<{ ok: boolean; person_id?: number; error?: string }> {
  const token = Deno.env.get("PIPEDRIVE_API_TOKEN");
  if (!token) return { ok: false, error: "PIPEDRIVE_API_TOKEN not set" };
  // Try to find existing person by email
  const searchResp = await fetch(
    `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/persons/search?term=${encodeURIComponent(email)}&fields=email&exact_match=true&api_token=${token}`
  );
  if (searchResp.ok) {
    const searchData = await searchResp.json();
    const items = (searchData?.data?.items || []) as Array<{ item: { id: number } }>;
    if (items.length > 0) return { ok: true, person_id: items[0].item.id };
  }
  // Create new
  const createResp = await fetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/persons?api_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      email: [{ value: email, primary: true, label: "work" }],
      phone: phone ? [{ value: phone, primary: true, label: "work" }] : undefined,
    }),
  });
  if (!createResp.ok) {
    return { ok: false, error: `Create person failed: ${createResp.status} ${await createResp.text()}` };
  }
  const created = await createResp.json();
  return { ok: true, person_id: created?.data?.id };
}

async function pipedriveCreateWebinarDeal(
  title: string,
  personId: number,
  ownerId: number,
): Promise<{ ok: boolean; deal_id?: number; deal_url?: string; error?: string }> {
  const token = Deno.env.get("PIPEDRIVE_API_TOKEN");
  if (!token) return { ok: false, error: "PIPEDRIVE_API_TOKEN not set" };
  const resp = await fetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/deals?api_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      person_id: personId,
      user_id: ownerId,
      pipeline_id: SZS_PIPELINE_ID,
      stage_id: SZS_STAGE_AGENDADO,
      status: "open",
    }),
  });
  if (!resp.ok) {
    return { ok: false, error: `Create deal failed: ${resp.status} ${await resp.text()}` };
  }
  const data = await resp.json();
  const dealId = data?.data?.id;
  return {
    ok: true,
    deal_id: dealId,
    deal_url: `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/deal/${dealId}`,
  };
}

async function pipedriveCreateNote(dealId: number, content: string): Promise<{ ok: boolean; error?: string; note_id?: number }> {
  const token = Deno.env.get("PIPEDRIVE_API_TOKEN");
  if (!token) return { ok: false, error: "PIPEDRIVE_API_TOKEN not set" };
  try {
    const resp = await fetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/notes?api_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deal_id: dealId, content }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      return { ok: false, error: `Create note failed: ${resp.status} ${err}` };
    }
    const data = await resp.json();
    return { ok: true, note_id: data?.data?.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
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
    if (resource === "internal" && rest[0] === "migrate-007") {
      const dbUrl = Deno.env.get("SUPABASE_DB_URL");
      if (!dbUrl) return json({ error: "SUPABASE_DB_URL not set" }, 500);
      const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
      const client = new Client(dbUrl);
      await client.connect();
      const statements = [
        `ALTER TABLE webinar_registrations ADD COLUMN IF NOT EXISTS fireflies_transcript_id text`,
        `ALTER TABLE webinar_registrations ADD COLUMN IF NOT EXISTS transcript_summary text`,
        `ALTER TABLE webinar_registrations ADD COLUMN IF NOT EXISTS transcript_synced_at timestamptz`,
        `ALTER TABLE webinar_registrations ADD COLUMN IF NOT EXISTS pipedrive_transcript_note_id bigint`,
      ];
      const results: Array<{ sql: string; ok: boolean; error?: string }> = [];
      for (const sql of statements) {
        try {
          await client.queryObject(sql);
          results.push({ sql, ok: true });
        } catch (err) {
          results.push({ sql, ok: false, error: (err as Error).message });
        }
      }
      await client.end();
      return json({ results });
    }
    if (resource === "internal" && rest[0] === "migrate-006") {
      const dbUrl = Deno.env.get("SUPABASE_DB_URL");
      if (!dbUrl) return json({ error: "SUPABASE_DB_URL not set" }, 500);
      const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
      const client = new Client(dbUrl);
      await client.connect();
      const statements = [
        `ALTER TABLE webinar_registrations ADD COLUMN IF NOT EXISTS is_opportunity boolean`,
        `ALTER TABLE webinar_registrations ADD COLUMN IF NOT EXISTS opportunity_marked_at timestamptz`,
      ];
      const results: Array<{ sql: string; ok: boolean; error?: string }> = [];
      for (const sql of statements) {
        try {
          await client.queryObject(sql);
          results.push({ sql, ok: true });
        } catch (err) {
          results.push({ sql, ok: false, error: (err as Error).message });
        }
      }
      await client.end();
      return json({ results });
    }
    if (resource === "internal" && rest[0] === "migrate-008") {
      const dbUrl = Deno.env.get("SUPABASE_DB_URL");
      if (!dbUrl) return json({ error: "SUPABASE_DB_URL not set" }, 500);
      const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
      const client = new Client(dbUrl);
      await client.connect();
      const statements = [
        `ALTER TABLE webinar_registrations ADD COLUMN IF NOT EXISTS cidade text`,
        `ALTER TABLE webinar_registrations ADD COLUMN IF NOT EXISTS tipo_imovel text`,
      ];
      const results: Array<{ sql: string; ok: boolean; error?: string }> = [];
      for (const sql of statements) {
        try {
          await client.queryObject(sql);
          results.push({ sql, ok: true });
        } catch (err) {
          results.push({ sql, ok: false, error: (err as Error).message });
        }
      }
      await client.end();
      return json({ results });
    }
    if (resource === "internal" && rest[0] === "test-email") {
      const data = await req.json().catch(() => ({})) as Record<string, unknown>;
      const to = (data.to as string) || "";
      if (!to) return json({ error: "Campo 'to' obrigatório" }, 400);
      try {
        await sendEmail("Seazone", to, "Teste de email — Webinar Platform", "<p>Se você recebeu este email, o envio está funcionando.</p>");
        return json({ ok: true, sent_to: to });
      } catch (err) {
        return json({ ok: false, error: (err as Error).message }, 500);
      }
    }
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
