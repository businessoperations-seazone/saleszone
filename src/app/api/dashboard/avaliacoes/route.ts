import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { V_COLS, SQUADS, SQUAD_V_MAP } from "@/lib/constants";
import type { AvaliacaoReuniao, AvaliacaoCloserSummary, AvaliacoesData, AvaliacaoJSON } from "@/lib/types";

export const dynamic = "force-dynamic";

// Normalize names for comparison (remove accents)
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function getSquadId(closerName: string): number {
  const n = norm(closerName);
  for (const sq of SQUADS) {
    const indices = SQUAD_V_MAP[sq.id] || [];
    const closerNames = indices.map((i) => V_COLS[i]).filter(Boolean);
    if (closerNames.some((c) => norm(c) === n || n.includes(norm(c)) || norm(c).includes(n))) {
      return sq.id;
    }
  }
  return 0;
}

// Minimum transcript length to be considered valid for evaluation
const MIN_TRANSCRIPT_CHARS = 500;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const daysBack = parseInt(url.searchParams.get("days") || "30", 10);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sb = createClient(supabaseUrl, supabaseKey);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  // Fetch all calendar events in period (paginated — may have >1000)
  let allEvents: Array<Record<string, unknown>> = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb
      .from("squad_calendar_events")
      .select("id,titulo,dia,hora,closer_name,closer_email,empreendimento,fireflies_id,transcricao,avaliacao,diagnostico,cancelou,duracao_min")
      .gte("dia", startStr)
      .lte("dia", endStr)
      .order("dia", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("[avaliacoes] Supabase error:", error);
      break;
    }
    if (!data || data.length === 0) break;
    allEvents = allEvents.concat(data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  // Filter to only closer events (closers from V_COLS), exclude cancelled
  const closerNorms = V_COLS.map(norm);
  const closerEvents = allEvents.filter((ev) => {
    if (ev.cancelou === true) return false; // exclude cancelled meetings
    const name = norm(String(ev.closer_name || ""));
    return closerNorms.some((cn) => name.includes(cn) || cn.includes(name));
  });

  // Build reuniao rows
  const reunioes: AvaliacaoReuniao[] = closerEvents.map((ev) => {
    const hasFireflies = !!ev.fireflies_id;
    const transcricao = ev.transcricao as string | null;
    const transcricaoChars = transcricao ? transcricao.length : 0;
    const cancelou = ev.cancelou === true;

    let avaliacaoObj: AvaliacaoJSON | null = null;
    if (ev.avaliacao) {
      try {
        avaliacaoObj = typeof ev.avaliacao === "string" ? JSON.parse(ev.avaliacao) : (ev.avaliacao as AvaliacaoJSON);
      } catch { /* ignore parse errors */ }
    }

    // Determine if transcript is invalid and why
    let invalidReason: string | null = null;
    if (!hasFireflies) {
      invalidReason = "Sem gravação (Fireflies não encontrou transcrição)";
    } else if (transcricaoChars > 0 && transcricaoChars < MIN_TRANSCRIPT_CHARS) {
      invalidReason = `Transcrição muito curta (${transcricaoChars} caracteres)`;
    } else if (transcricaoChars === 0 && hasFireflies) {
      invalidReason = "Transcrição vazia ou alucinação detectada";
    } else if (avaliacaoObj && avaliacaoObj.nota_final === 0) {
      invalidReason = "Transcrição corrompida (áudio ilegível)";
    }

    return {
      eventId: String(ev.id),
      titulo: String(ev.titulo || ""),
      dia: String(ev.dia || ""),
      hora: String(ev.hora || ""),
      closerName: String(ev.closer_name || ""),
      closerEmail: String(ev.closer_email || ""),
      empreendimento: ev.empreendimento as string | null,
      firefliesId: ev.fireflies_id as string | null,
      transcricaoChars,
      avaliacao: avaliacaoObj,
      diagnostico: ev.diagnostico as string | null,
      cancelou,
      duracaoMin: ev.duracao_min as number | null,
      invalidReason,
    };
  });

  // Group by closer
  const closerMap = new Map<string, AvaliacaoReuniao[]>();
  for (const r of reunioes) {
    const key = norm(r.closerName);
    if (!closerMap.has(key)) closerMap.set(key, []);
    closerMap.get(key)!.push(r);
  }

  const closers: AvaliacaoCloserSummary[] = [];
  for (const [, closerReunioes] of closerMap) {
    const name = closerReunioes[0].closerName;
    const squadId = getSquadId(name);

    const totalReunioes = closerReunioes.length;
    const validas = closerReunioes.filter((r) => !r.invalidReason);
    const invalidas = closerReunioes.filter((r) => !!r.invalidReason);
    const avaliadas = validas.filter((r) => r.avaliacao);
    // Exclude nota 0 evaluations (corrupted transcripts) from averages
    const avaliadasReais = avaliadas.filter((r) => r.avaliacao!.nota_final > 0);

    let notaMedia: number | null = null;
    const pilarSums = { conhecimento_produto: 0, tecnicas_venda: 0, rapport_empatia: 0, foco_cta: 0, objetividade: 0 };
    if (avaliadasReais.length > 0) {
      let totalNota = 0;
      for (const r of avaliadasReais) {
        const a = r.avaliacao!;
        totalNota += a.nota_final;
        for (const k of Object.keys(pilarSums) as (keyof typeof pilarSums)[]) {
          pilarSums[k] += a.pilares[k]?.nota ?? 0;
        }
      }
      notaMedia = Math.round((totalNota / avaliadasReais.length) * 10) / 10;
    }

    const pilarAvg = avaliadasReais.length > 0
      ? {
          conhecimento_produto: Math.round((pilarSums.conhecimento_produto / avaliadasReais.length) * 10) / 10,
          tecnicas_venda: Math.round((pilarSums.tecnicas_venda / avaliadasReais.length) * 10) / 10,
          rapport_empatia: Math.round((pilarSums.rapport_empatia / avaliadasReais.length) * 10) / 10,
          foco_cta: Math.round((pilarSums.foco_cta / avaliadasReais.length) * 10) / 10,
          objetividade: Math.round((pilarSums.objetividade / avaliadasReais.length) * 10) / 10,
        }
      : { conhecimento_produto: null, tecnicas_venda: null, rapport_empatia: null, foco_cta: null, objetividade: null };

    closers.push({
      name,
      squadId,
      totalReunioes,
      transcricoesValidas: validas.length,
      transcricoesInvalidas: invalidas.length,
      reunioesAvaliadas: avaliadasReais.length,
      notaMedia,
      pilares: pilarAvg,
      reunioes: closerReunioes.sort((a, b) => b.dia.localeCompare(a.dia)),
    });
  }

  // Sort closers by notaMedia desc (null last)
  closers.sort((a, b) => {
    if (a.notaMedia == null && b.notaMedia == null) return 0;
    if (a.notaMedia == null) return 1;
    if (b.notaMedia == null) return -1;
    return b.notaMedia - a.notaMedia;
  });

  // Totals
  const allAvaliadas = closers.reduce((s, c) => s + c.reunioesAvaliadas, 0);
  const totalNota = closers.reduce((s, c) => s + (c.notaMedia ?? 0) * c.reunioesAvaliadas, 0);
  const notaMediaGlobal = allAvaliadas > 0 ? Math.round((totalNota / allAvaliadas) * 10) / 10 : null;

  const result: AvaliacoesData = {
    closers,
    totals: {
      totalReunioes: reunioes.length,
      transcricoesValidas: reunioes.filter((r) => !r.invalidReason).length,
      transcricoesInvalidas: reunioes.filter((r) => !!r.invalidReason).length,
      reunioesAvaliadas: allAvaliadas,
      notaMedia: notaMediaGlobal,
    },
    periodo: { from: startStr, to: endStr },
  };

  return NextResponse.json(result);
}
