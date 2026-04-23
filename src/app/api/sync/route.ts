import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min

// Each step runs as a separate Edge Function call to stay within 150MB memory limit.
// Order matters: daily-open replaces counts, won/lost merge into existing.
const FUNCTION_MAP: Record<string, Array<{ name: string; body?: Record<string, unknown> }>> = {
  "meta-ads": [{ name: "sync-squad-meta-ads" }],
  // Full dashboard sync (used by pg_cron)
  dashboard: [
    { name: "sync-squad-dashboard", body: { mode: "daily-open" } },
    { name: "sync-squad-dashboard", body: { mode: "daily-won" } },
    { name: "sync-squad-dashboard", body: { mode: "daily-lost" } },
    { name: "sync-squad-dashboard", body: { mode: "alignment" } },
    { name: "sync-squad-dashboard", body: { mode: "metas" } },
    { name: "sync-squad-dashboard", body: { mode: "monthly-rollup" } },
  ],
  // Light dashboard: skip daily-lost (58k+ deals, estoura memória). Cron cuida do lost a cada 2h.
  "dashboard-light": [
    { name: "sync-squad-dashboard", body: { mode: "daily-open" } },
    { name: "sync-squad-dashboard", body: { mode: "daily-won" } },
    { name: "sync-squad-dashboard", body: { mode: "alignment" } },
    { name: "sync-squad-dashboard", body: { mode: "metas" } },
    { name: "sync-squad-dashboard", body: { mode: "monthly-rollup" } },
  ],
  calendar: [{ name: "sync-squad-calendar" }],
  presales: [{ name: "sync-squad-presales" }],
  baserow: [{ name: "sync-baserow-forms" }],
  // Full deals sync (used by pg_cron)
  deals: [
    { name: "sync-squad-deals", body: { mode: "deals-open" } },
    { name: "sync-squad-deals", body: { mode: "deals-won" } },
    { name: "sync-squad-deals", body: { mode: "deals-lost" } },
    { name: "sync-squad-deals", body: { mode: "deals-flow" } },
  ],
  // Light deals: inclui deals-lost com cutoff 30d (só perdidos recentes, evita timeout dos 58k+). deals-flow ainda pulado.
  "deals-light": [
    { name: "sync-squad-deals", body: { mode: "deals-open" } },
    { name: "sync-squad-deals", body: { mode: "deals-won" } },
    { name: "sync-squad-deals", body: { mode: "deals-lost", cutoff_days: 30 } },
  ],
  // --- MKTP (Marketplace) sync functions ---
  "mktp-dashboard": [
    { name: "sync-mktp-dashboard", body: { mode: "daily-open" } },
    { name: "sync-mktp-dashboard", body: { mode: "daily-won" } },
    { name: "sync-mktp-dashboard", body: { mode: "daily-lost" } },
    { name: "sync-mktp-dashboard", body: { mode: "alignment" } },
    { name: "sync-mktp-dashboard", body: { mode: "metas" } },
    { name: "sync-mktp-dashboard", body: { mode: "monthly-rollup" } },
  ],
  "mktp-dashboard-light": [
    { name: "sync-mktp-dashboard", body: { mode: "daily-open" } },
    { name: "sync-mktp-dashboard", body: { mode: "daily-won" } },
    { name: "sync-mktp-dashboard", body: { mode: "alignment" } },
    { name: "sync-mktp-dashboard", body: { mode: "metas" } },
    { name: "sync-mktp-dashboard", body: { mode: "monthly-rollup" } },
  ],
  "mktp-meta-ads": [{ name: "sync-mktp-meta-ads" }],
  "mktp-calendar": [{ name: "sync-mktp-calendar" }],
  "mktp-presales": [{ name: "sync-mktp-presales" }],
  "mktp-deals": [
    { name: "sync-mktp-deals", body: { mode: "deals-open" } },
    { name: "sync-mktp-deals", body: { mode: "deals-won" } },
    { name: "sync-mktp-deals", body: { mode: "deals-lost" } },
    { name: "sync-mktp-deals", body: { mode: "deals-flow" } },
  ],
  "mktp-deals-light": [
    { name: "sync-mktp-deals", body: { mode: "deals-open" } },
    { name: "sync-mktp-deals", body: { mode: "deals-won" } },
  ],
  // --- SZS (Serviços) sync functions ---
  "szs-dashboard": [
    { name: "sync-szs-dashboard", body: { mode: "daily-open" } },
    { name: "sync-szs-dashboard", body: { mode: "daily-won" } },
    { name: "sync-szs-dashboard", body: { mode: "daily-lost" } },
    { name: "sync-szs-dashboard", body: { mode: "alignment" } },
    { name: "sync-szs-dashboard", body: { mode: "metas" } },
    { name: "sync-szs-dashboard", body: { mode: "monthly-rollup" } },
    { name: "sync-szs-dashboard", body: { mode: "snapshot" } },
  ],
  "szs-dashboard-light": [
    { name: "sync-szs-dashboard", body: { mode: "daily-open" } },
    { name: "sync-szs-dashboard", body: { mode: "daily-won" } },
    { name: "sync-szs-dashboard", body: { mode: "alignment" } },
    { name: "sync-szs-dashboard", body: { mode: "metas" } },
    { name: "sync-szs-dashboard", body: { mode: "monthly-rollup" } },
    { name: "sync-szs-dashboard", body: { mode: "snapshot" } },
  ],
  "szs-meta-ads": [{ name: "sync-szs-meta-ads" }],
  "szs-calendar": [{ name: "sync-szs-calendar" }],
  "szs-presales": [{ name: "sync-szs-presales" }],
  "szs-deals": [
    { name: "sync-szs-deals", body: { mode: "deals-open" } },
    { name: "sync-szs-deals", body: { mode: "deals-won" } },
    { name: "sync-szs-deals", body: { mode: "deals-lost" } },
    { name: "sync-szs-deals", body: { mode: "deals-flow" } },
  ],
  "szs-deals-light": [
    { name: "sync-szs-deals", body: { mode: "deals-open" } },
    { name: "sync-szs-deals", body: { mode: "deals-won" } },
  ],
  // --- Decor sync functions ---
  "decor-presales": [{ name: "sync-decor-presales" }],
  "decor-deals": [
    { name: "sync-decor-deals", body: { mode: "deals-open" } },
    { name: "sync-decor-deals", body: { mode: "deals-won" } },
  ],
  "decor-deals-light": [
    { name: "sync-decor-deals", body: { mode: "deals-open" } },
    { name: "sync-decor-deals", body: { mode: "deals-won" } },
  ],
};

// DB-only modes — no external API calls, run after all API steps complete
const DB_ONLY_MODES = new Set(["metas", "monthly-rollup"]);

// Priority map: lower = slower = starts first in the pool.
// Ensures slowest functions (presales ~35s, meta-ads ~22s) begin at t=0.
const STEP_PRIORITY: Record<string, number> = {
  presales: 0,
  "meta-ads": 1,
  "daily-open": 2,
  "daily-won": 3,
  alignment: 4,
  "deals-open": 5,
  "deals-won": 6,
  calendar: 7,
  baserow: 8,
};

function getStepPriority(label: string): number {
  // label format: "fn-key:mode-or-name", e.g. "mktp-presales:sync-mktp-presales"
  // Extract the function key (before ':') and match against known step names
  const fnKey = label.split(":")[0];
  const mode = label.split(":")[1] ?? "";

  // Try mode first (e.g. "daily-open"), then check if fnKey ends with a known step
  if (mode in STEP_PRIORITY) return STEP_PRIORITY[mode];
  for (const [key, pri] of Object.entries(STEP_PRIORITY)) {
    if (fnKey.endsWith(key)) return pri;
  }
  return 99; // unknown — run last
}

const POOL_SIZE = 4; // Max concurrent Edge Functions
const RETRY_DELAY = 3_000; // 3s before retry on 504

interface SyncRequest {
  functions: string[];
}

interface FunctionResult {
  function: string;
  status: "success" | "error";
  error?: string;
  durationMs?: number;
}

async function callEdgeFunction(
  supabaseUrl: string,
  supabaseKey: string,
  step: { name: string; body?: Record<string, unknown> },
  label: string,
): Promise<FunctionResult> {
  const t0 = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/${step.name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: step.body ? JSON.stringify(step.body) : undefined,
      });
      if (!response.ok) {
        const text = await response.text();
        // Retry only on 504 (Supabase gateway timeout) — transient, worth retrying
        if (response.status === 504 && attempt === 0) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY));
          continue;
        }
        return { function: label, status: "error", error: `${response.status}: ${text}`, durationMs: Date.now() - t0 };
      }
      return { function: label, status: "success", durationMs: Date.now() - t0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { function: label, status: "error", error: msg, durationMs: Date.now() - t0 };
    }
  }
  return { function: label, status: "error", error: "Max retries exceeded", durationMs: Date.now() - t0 };
}

type Step = { label: string; step: { name: string; body?: Record<string, unknown> } };

/** Pool of N concurrent workers processing items in FIFO order. */
async function runPool<T>(items: T[], fn: (item: T) => Promise<FunctionResult>): Promise<FunctionResult[]> {
  const results = new Array<FunctionResult>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL_SIZE, items.length) }, () => worker()));
  return results;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Supabase environment variables not configured" },
      { status: 500 },
    );
  }

  let body: SyncRequest;
  try {
    body = (await request.json()) as SyncRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.functions) || body.functions.length === 0) {
    return NextResponse.json(
      { error: "Missing or empty 'functions' array" },
      { status: 400 },
    );
  }

  const invalid = body.functions.filter((f) => !(f in FUNCTION_MAP));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Unknown functions: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }

  // Separate API steps from DB-only steps.
  // API steps run in a concurrency pool (max 4 workers, sorted slowest-first).
  // DB-only steps (metas, rollup) run after all API steps complete.
  const apiSteps: Step[] = [];
  const dbSteps: Step[] = [];

  for (const fn of body.functions) {
    for (const step of FUNCTION_MAP[fn]) {
      const label = `${fn}:${step.body?.mode || step.name}`;
      const mode = (step.body?.mode as string) ?? "";
      if (DB_ONLY_MODES.has(mode)) {
        dbSteps.push({ label, step });
      } else {
        apiSteps.push({ label, step });
      }
    }
  }

  // Sort API steps by priority (slowest first — presales, meta-ads start at t=0)
  apiSteps.sort((a, b) => getStepPriority(a.label) - getStepPriority(b.label));

  const call = ({ label, step }: Step) => callEdgeFunction(supabaseUrl, supabaseKey, step, label);
  const results: FunctionResult[] = [];

  // Phase 1: Run API steps through concurrency pool (max 4 concurrent)
  if (apiSteps.length > 0) {
    results.push(...await runPool(apiSteps, call));
  }

  // Phase 2: DB-only steps (metas, rollup) — depend on API data, run after pool finishes
  if (dbSteps.length > 0) {
    results.push(...await Promise.all(dbSteps.map(call)));
  }

  const hasErrors = results.some((r) => r.status === "error");
  return NextResponse.json({ results }, { status: hasErrors ? 207 : 200 });
}
