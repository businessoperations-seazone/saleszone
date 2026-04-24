import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let DB_SCHEMA = "public";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
// ---- Google Service Account JWT Auth ----
function base64url(data) {
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function str2ab(str) {
  return new TextEncoder().encode(str);
}
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN.*?-----/g, "").replace(/-----END.*?-----/g, "").replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i++){
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
async function importPrivateKey(pem) {
  const keyData = pemToArrayBuffer(pem);
  return crypto.subtle.importKey("pkcs8", keyData, {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
}
async function createSignedJwt(serviceAccountEmail, privateKey, subject) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const payload = {
    iss: serviceAccountEmail,
    sub: subject,
    scope: "https://www.googleapis.com/auth/calendar.events.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const headerB64 = base64url(str2ab(JSON.stringify(header)));
  const payloadB64 = base64url(str2ab(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, str2ab(unsigned));
  const signatureB64 = base64url(new Uint8Array(signature));
  return `${unsigned}.${signatureB64}`;
}
async function getAccessToken(serviceAccountEmail, privateKey, subject) {
  const jwt = await createSignedJwt(serviceAccountEmail, privateKey, subject);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google OAuth error for ${subject}: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}
async function listCalendarEvents(accessToken, calendarId, timeMin, timeMax) {
  const events = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      timeZone: "America/Sao_Paulo",
      maxResults: "250",
      singleEvents: "true",
      orderBy: "startTime"
    });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Calendar API error for ${calendarId}: ${res.status} ${err}`);
    }
    const data = await res.json();
    if (data.items) events.push(...data.items);
    pageToken = data.nextPageToken || "";
  }while (pageToken)
  return events;
}
// ---- Empreendimento Extraction (cascata) ----
function extractEmpreendimento(summary, rule) {
  if (!summary) return null;
  // 1. Pipe "|"
  const pipeIdx = summary.indexOf(" | ");
  if (pipeIdx >= 0) {
    const after = summary.substring(pipeIdx + 3).trim();
    const lower = after.toLowerCase();
    if (!lower.includes("ligação") && !lower.includes("+55") && !lower.includes("telefone")) {
      return after.split(" - ")[0].trim() || null;
    }
  }
  // 2. Ampersand "& "
  const ampIdx = summary.indexOf("& ");
  if (ampIdx >= 0) {
    const after = summary.substring(ampIdx + 2).trim();
    return after.split(" - ")[0].trim() || null;
  }
  // 3. "<>"
  const chevIdx = summary.indexOf("<>");
  if (chevIdx >= 0) {
    const after = summary.substring(chevIdx + 2).trim();
    return after.split(" - ")[0].trim() || null;
  }
  // 4. " - " after prefix
  const prefixes = [
    "Apresentação Seazone Investimentos",
    "Apresentação Seazone Decor",
    "Apresentação Seazone",
    "Apresentação",
    "Seazone"
  ];
  for (const pfx of prefixes){
    if (summary.toLowerCase().startsWith(pfx.toLowerCase())) {
      const rest = summary.substring(pfx.length).trim();
      if (rest.startsWith("- ")) {
        const part = rest.substring(2).trim();
        const dashIdx = part.indexOf(" - ");
        return dashIdx >= 0 ? part.substring(0, dashIdx).trim() : part;
      }
    }
  }
  // 5. Fallback "Spot"
  if (summary.includes("Spot")) {
    for (const pfx of prefixes){
      if (summary.toLowerCase().startsWith(pfx.toLowerCase())) {
        const rest = summary.substring(pfx.length).trim();
        const lastDash = rest.lastIndexOf(" - ");
        return lastDash >= 0 ? rest.substring(0, lastDash).trim() : rest;
      }
    }
  }
  return null;
}
// ---- Name from email ----
function nameFromEmail(email) {
  const local = email.split("@")[0];
  return local.split(".").map((p)=>p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
async function syncCalendar(supabase, serviceAccountEmail, privateKey) {
  // 1. Read closer rules
  const { data: rules, error: rulesErr } = await supabase.from("squad_closer_rules").select("email, prefixo, empreendimento_rule, setor");
  if (rulesErr || !rules?.length) {
    throw new Error(`Failed to read closer rules: ${rulesErr?.message || "no rules found"}`);
  }
  console.log(`Found ${rules.length} closer rules`);
  // 2. Calculate time window: today-2 to today+7
  const now = new Date();
  const minDate = new Date(now);
  minDate.setDate(minDate.getDate() - 2);
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + 7);
  const timeMin = minDate.toISOString().substring(0, 10) + "T00:00:00-03:00";
  const timeMax = maxDate.toISOString().substring(0, 10) + "T23:59:59-03:00";
  console.log(`Time window: ${timeMin} to ${timeMax}`);
  const allRows = [];
  const closerCounts = {};
  const errors = [];
  // 3. Process each closer
  for (const rule of rules){
    try {
      const accessToken = await getAccessToken(serviceAccountEmail, privateKey, rule.email);
      const events = await listCalendarEvents(accessToken, rule.email, timeMin, timeMax);
      console.log(`  ${rule.email}: ${events.length} total events`);
      let count = 0;
      for (const evt of events){
        if (!evt.summary) continue;
        // Filter by prefix (case-insensitive)
        if (!evt.summary.toLowerCase().startsWith(rule.prefixo.toLowerCase())) continue;
        // Parse datetime
        const startStr = evt.start.dateTime || evt.start.date;
        if (!startStr) continue;
        const startDt = new Date(startStr);
        const endStr = evt.end.dateTime || evt.end.date;
        const endDt = endStr ? new Date(endStr) : startDt;
        // Duration in minutes
        const durationMin = Math.round((endDt.getTime() - startDt.getTime()) / 60000);
        // Format day and time in America/Sao_Paulo
        const diaStr = startDt.toLocaleDateString("en-CA", {
          timeZone: "America/Sao_Paulo"
        }); // YYYY-MM-DD
        const horaStr = startDt.toLocaleTimeString("en-GB", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        });
        // Empreendimento
        const empreendimento = extractEmpreendimento(evt.summary, rule.empreendimento_rule);
        // Cancelamento: closer declined
        const closerAttendee = evt.attendees?.find((a)=>a.email.toLowerCase() === rule.email.toLowerCase());
        const cancelou = closerAttendee?.responseStatus === "declined";
        // Transcript
        const transcript = evt.attachments?.find((a)=>a.title?.toLowerCase().includes("transcript"));
        allRows.push({
          event_id: evt.htmlLink,
          closer_email: rule.email,
          closer_name: nameFromEmail(rule.email),
          setor: rule.setor,
          dia: diaStr,
          hora: horaStr,
          duracao_min: durationMin,
          titulo: evt.summary,
          empreendimento,
          cancelou,
          reagendamento: false,
          transcript_url: transcript?.fileUrl || null,
          synced_at: new Date().toISOString()
        });
        count++;
      }
      closerCounts[rule.email] = count;
      console.log(`  ${rule.email}: ${count} matching events`);
    } catch (err) {
      const msg = `${rule.email}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`  ERROR ${msg}`);
      errors.push(msg);
    }
  }
  // 4. Upsert into decor_calendar_events
  if (allRows.length > 0) {
    // Delete existing events in the window and re-insert (simpler than detecting reagendamentos)
    const windowStart = minDate.toISOString().substring(0, 10);
    const windowEnd = maxDate.toISOString().substring(0, 10);
    await supabase.from("decor_calendar_events").delete().gte("dia", windowStart).lte("dia", windowEnd);
    for(let i = 0; i < allRows.length; i += 500){
      const batch = allRows.slice(i, i + 500);
      const { error } = await supabase.from("decor_calendar_events").upsert(batch, {
        onConflict: "event_id"
      });
      if (error) console.error(`Upsert error batch ${i}:`, error.message);
    }
  }
  console.log(`Total: ${allRows.length} events synced, ${errors.length} errors`);
  return {
    total: allRows.length,
    closers: closerCounts,
    errors
  };
}
// ---- Handler ----
Deno.serve(async (req) => {
  // DB_SCHEMA injected
  try {
    const __body = await req.clone().json().catch(() => ({}));
    DB_SCHEMA = __body?.__schema || "public";
  } catch { DB_SCHEMA = "public"; }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  const startTime = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { db: { schema: DB_SCHEMA } });
    // Auth: Supabase gateway already verifies the JWT
    // Read Google Service Account credentials from Vault
    const { data: saJson } = await supabase.schema("public").rpc("vault_read_secret", {
      secret_name: "GOOGLE_SERVICE_ACCOUNT"
    });
    if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT not found in vault");
    const sa = JSON.parse(saJson.trim());
    const privateKey = await importPrivateKey(sa.private_key);
    console.log(`Service account: ${sa.client_email}`);
    const result = await syncCalendar(supabase, sa.client_email, privateKey);
    const elapsed = Date.now() - startTime;
    console.log(`sync-squad-calendar completed in ${elapsed}ms`);
    return new Response(JSON.stringify({
      success: true,
      result,
      elapsed_ms: elapsed
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("sync-squad-calendar fatal:", msg);
    return new Response(JSON.stringify({
      success: false,
      error: msg
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
