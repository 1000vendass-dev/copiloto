import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { computeQuality } from "@/features/copilot/quality";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Departamento de Dados da empresa de agentes (escritório, container empresa-ceo): leitura dos dados do Copiloto.
 * SOMENTE LEITURA, só GET e só pela rede interna, com token próprio (DADOS_API_TOKEN). O Copiloto é do Comercial;
 * o Dados consulta e calcula os números (as definições ficam no Dados). Correção de dado é feita no Copiloto.
 *   GET /api/dados/leads      todos os leads com o mínimo para o funil (classe da IA, tipo do contato)
 *   GET /api/dados/qualidade  checagens de qualidade em SQL (as mesmas do relatório da noite)
 */

function authorized(req: NextRequest): boolean {
  const token = process.env.DADOS_API_TOKEN;
  if (!token || token.length < 32) return false;
  const given = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

type Admin = ReturnType<typeof createAdminClient>;
const COLS = "id,team_id,name,phone,source,stage,temperature,interest,lost_reason,closed_value,closed_at,last_contact_at,created_at,ai_insights";

async function leads(admin: Admin) {
  const rows: Record<string, unknown>[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin.from("leads").select(COLS).order("created_at", { ascending: true }).range(de, de + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const categoria = new Map<string, string>();
  for (let i = 0; i < rows.length; i += 200) {
    const ids = rows.slice(i, i + 200).map((r) => r.id as string);
    const { data } = await admin.from("whatsapp_contacts").select("lead_id,categoria").in("lead_id", ids);
    for (const c of data ?? []) categoria.set(c.lead_id as string, (c.categoria as string | null) ?? "cliente");
  }
  return rows.map(({ ai_insights, ...l }) => {
    const ins = (ai_insights ?? {}) as { classe?: string; motivo_classificacao?: string; ruido_motivo?: string | null; atualizado_em?: string; followup?: { encerrar?: string | null; tentativas?: number } };
    return {
      ...l,
      categoria: categoria.get(l.id as string) ?? null, // null = sem WhatsApp ligado
      classe: ins.classe ?? null, motivo_classificacao: ins.motivo_classificacao ?? null, ruido_motivo: ins.ruido_motivo ?? null,
      classificado_em: ins.atualizado_em ?? null,
      followup_sugere_encerrar: ins.followup?.encerrar ?? null, followup_tentativas: ins.followup?.tentativas ?? 0,
    };
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ consulta: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { consulta } = await params;
  const admin = createAdminClient();
  try {
    if (consulta === "leads") return NextResponse.json({ ok: true, gerado_em: new Date().toISOString(), leads: await leads(admin) });
    if (consulta === "qualidade") {
      const { data: times } = await admin.from("teams").select("id");
      const out = [];
      for (const t of times ?? []) out.push({ team_id: t.id, ...(await computeQuality(admin, t.id as string)) });
      return NextResponse.json({ ok: true, gerado_em: new Date().toISOString(), times: out });
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (e) {
    console.error("[dados]", consulta, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
