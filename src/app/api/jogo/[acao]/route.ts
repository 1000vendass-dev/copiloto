import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { STAGE_VALUES } from "@/features/crm/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { findAccount } from "@/lib/whatsapp/ingest";
import { enviarTexto } from "@/lib/whatsapp/enviar";
import { wahaSession } from "@/lib/whatsapp/waha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O jogo do escritório (container empresa-ceo) usando o Copiloto como ferramenta: o dono administra a loja pelo jogo.
 * Só pela rede interna, com chave própria (JOGO_API_TOKEN), diferente da chave do Dados, que é só leitura.
 *   GET  /api/jogo/estado     leads em andamento (conversa recente e rascunho pendente) e o estoque
 *   POST /api/jogo/enviar     { leadId, texto, draftId? }  envia pelo WhatsApp: só quando o dono aperta Enviar no jogo
 *   POST /api/jogo/descartar  { draftId }                  descarta um rascunho
 *   POST /api/jogo/etapa      { leadId, etapa }            muda a etapa do funil (a perda continua sendo decisão do dono)
 *   POST /api/jogo/lida       { leadId }                   marca a conversa como lida
 * A IA nunca chama esta rota: quem envia é o dono, pelo botão.
 */

function authorized(req: NextRequest): boolean {
  const token = process.env.JOGO_API_TOKEN;
  if (!token || token.length < 32) return false;
  const given = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

type Admin = ReturnType<typeof createAdminClient>;
const ABERTAS = ["novo", "primeiro_contato", "atendimento", "qualificado", "visita", "proposta", "negociacao", "sem_resposta"];
const MAX_LEADS = 40;

async function equipe(admin: Admin): Promise<string | null> {
  const conta = await findAccount(admin, wahaSession());
  return conta?.team_id ?? null;
}

async function estado(admin: Admin, teamId: string) {
  const desde = new Date(Date.now() - 45 * 86400_000).toISOString();
  const vendidosDesde = new Date(Date.now() - 3 * 86400_000).toISOString();
  const cols = "id,name,stage,temperature,interest,source,vehicle_id,next_action,next_action_at,last_contact_at,closed_at,created_at,ai_insights";
  const [{ data: abertos }, { data: vendidos }] = await Promise.all([
    admin.from("leads").select(cols).eq("team_id", teamId).in("stage", ABERTAS).gte("updated_at", desde).order("updated_at", { ascending: false }).limit(MAX_LEADS),
    admin.from("leads").select(cols).eq("team_id", teamId).eq("stage", "venda").gte("closed_at", vendidosDesde).limit(8),
  ]);
  const lista = [...(abertos ?? []), ...(vendidos ?? [])];
  const ids = lista.map((l) => l.id as string);
  if (!ids.length) return { leads: [], estoque: await estoque(admin, teamId) };

  const { data: contatos } = await admin.from("whatsapp_contacts").select("id,lead_id,categoria").in("lead_id", ids);
  const contatoDe = new Map<string, { id: string; categoria: string | null }>();
  for (const c of contatos ?? []) contatoDe.set(c.lead_id as string, { id: c.id as string, categoria: (c.categoria as string | null) ?? "cliente" });
  // só lead entra no jogo: spam, loja, parceiro e próprio ficam fora do escritório
  const clientes = lista.filter((l) => (contatoDe.get(l.id as string)?.categoria ?? "cliente") === "cliente");
  const contatoIds = clientes.map((l) => contatoDe.get(l.id as string)?.id).filter(Boolean) as string[];

  const [{ data: convs }, { data: rascunhos }] = await Promise.all([
    contatoIds.length ? admin.from("whatsapp_conversations").select("id,contact_id,unread_count,last_message_at").in("contact_id", contatoIds) : Promise.resolve({ data: [] }),
    admin.from("whatsapp_drafts").select("id,lead_id,body,source,created_at").in("lead_id", clientes.map((l) => l.id as string)).eq("status", "pendente").order("created_at", { ascending: false }),
  ]);
  const convDe = new Map<string, { id: string; unread: number }>();
  for (const c of convs ?? []) convDe.set(c.contact_id as string, { id: c.id as string, unread: (c.unread_count as number) ?? 0 });
  const convIds = [...convDe.values()].map((c) => c.id);
  const msgsDe = new Map<string, { direcao: string; texto: string; quando: string }[]>();
  if (convIds.length) {
    const { data: msgs } = await admin.from("whatsapp_messages").select("conversation_id,direction,body,type,sent_at")
      .in("conversation_id", convIds).gte("sent_at", desde).order("sent_at", { ascending: false }).limit(convIds.length * 8);
    for (const m of msgs ?? []) {
      const arr = msgsDe.get(m.conversation_id as string) ?? [];
      if (arr.length < 8) arr.push({ direcao: m.direction as string, texto: (m.body as string) || `[${m.type}]`, quando: m.sent_at as string });
      msgsDe.set(m.conversation_id as string, arr);
    }
  }
  const rascunhoDe = new Map<string, { id: string; texto: string; por: string }>();
  for (const r of rascunhos ?? []) if (!rascunhoDe.has(r.lead_id as string)) rascunhoDe.set(r.lead_id as string, { id: r.id as string, texto: r.body as string, por: r.source as string });

  return {
    leads: clientes.map((l) => {
      const contato = contatoDe.get(l.id as string);
      const conv = contato ? convDe.get(contato.id) : undefined;
      const ins = (l.ai_insights ?? {}) as { classe?: string };
      return {
        id: l.id, nome: l.name, etapa: l.stage, temperatura: l.temperature, classe: ins.classe ?? null, interesse: l.interest, origem: l.source,
        veiculo_id: l.vehicle_id, proximo: l.next_action, proximo_em: l.next_action_at, ultimo_contato: l.last_contact_at,
        nao_lidas: conv?.unread ?? 0, mensagens: (conv ? msgsDe.get(conv.id) ?? [] : []).reverse(), rascunho: rascunhoDe.get(l.id as string) ?? null,
      };
    }),
    estoque: await estoque(admin, teamId),
  };
}

async function estoque(admin: Admin, teamId: string) {
  const { data } = await admin.from("vehicles").select("id,brand,model,version,year_model,km,color,body_type,sale_price,status,entry_date,stock_code")
    .eq("team_id", teamId).in("status", ["disponivel", "reservado"]).order("entry_date", { ascending: true }).limit(40);
  return data ?? [];
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ acao: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { acao } = await params;
  if (acao !== "estado") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin = createAdminClient();
  try {
    const teamId = await equipe(admin);
    if (!teamId) return NextResponse.json({ error: "WhatsApp não configurado" }, { status: 503 });
    return NextResponse.json({ ok: true, gerado_em: new Date().toISOString(), ...(await estado(admin, teamId)) });
  } catch (e) {
    console.error("[jogo] estado", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

const uuid = z.string().uuid();
const corpos = {
  enviar: z.object({ leadId: uuid, texto: z.string().min(1).max(4000), draftId: uuid.optional() }),
  descartar: z.object({ draftId: uuid }),
  etapa: z.object({ leadId: uuid, etapa: z.enum(STAGE_VALUES) }),
  lida: z.object({ leadId: uuid }),
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ acao: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { acao } = await params;
  if (!(acao in corpos)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = corpos[acao as keyof typeof corpos].safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const admin = createAdminClient();
  const teamId = await equipe(admin);
  if (!teamId) return NextResponse.json({ error: "WhatsApp não configurado" }, { status: 503 });
  try {
    if (acao === "enviar") {
      const b = parsed.data as z.infer<typeof corpos.enviar>;
      const r = await enviarTexto(admin, teamId, b.leadId, b.texto, b.draftId);
      console.log(`[jogo] enviar lead=${b.leadId} ok=${r.ok}`);
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    if (acao === "descartar") {
      const b = parsed.data as z.infer<typeof corpos.descartar>;
      const { error } = await admin.from("whatsapp_drafts").update({ status: "descartado" }).eq("id", b.draftId).eq("team_id", teamId).eq("status", "pendente");
      return NextResponse.json({ ok: !error });
    }
    if (acao === "etapa") {
      const b = parsed.data as z.infer<typeof corpos.etapa>;
      const { error, count } = await admin.from("leads").update({ stage: b.etapa }, { count: "exact" }).eq("id", b.leadId).eq("team_id", teamId);
      return NextResponse.json({ ok: !error && !!count }, { status: !error && count ? 200 : 400 });
    }
    const b = parsed.data as z.infer<typeof corpos.lida>;
    const { data: contatos } = await admin.from("whatsapp_contacts").select("id").eq("lead_id", b.leadId).eq("team_id", teamId);
    const ids = (contatos ?? []).map((c) => c.id as string);
    if (ids.length) await admin.from("whatsapp_conversations").update({ unread_count: 0 }).in("contact_id", ids).gt("unread_count", 0);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[jogo]", acao, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
