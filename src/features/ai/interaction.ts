import "server-only";

import { OPEN_STAGES, stageLabel } from "@/features/crm/constants";
import type { ToolContext } from "./tools";

type Json = Record<string, unknown>;
const str = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) { const n = Number(v.replace(/[R$\s.]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; }
  return null;
};
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const digits = (v: unknown) => (typeof v === "string" ? v.replace(/\D/g, "") : "");
const iso = (v: unknown) => {
  const s = str(v, 40);
  if (!s) return null;
  const withTz = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.length === 10 ? s + "T09:00:00" : s}-03:00`;
  const d = new Date(withTz);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Próximo dia útil +n às 09:00 (São Paulo). */
function businessDaysAhead(n: number): string {
  const d = new Date(Date.now() - 3 * 3600 * 1000); // "agora" em SP
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return new Date(`${d.toISOString().slice(0, 10)}T09:00:00-03:00`).toISOString();
}

const CONTACT_TITLES: Record<string, string> = {
  ligacao: "Ligação registrada", whatsapp: "Conversa no WhatsApp", email: "E-mail enviado",
  visita: "Visita na loja", test_drive: "Test-drive realizado", follow_up: "Contato registrado",
};
const APPT_TYPES = ["visita", "test_drive", "ligacao", "reuniao", "entrega", "outro"];
const SETTABLE_STAGES = ["novo", "primeiro_contato", "atendimento", "qualificado", "visita", "proposta", "negociacao", "sem_resposta"];

export const REGISTER_INTERACTION_TOOL = {
  name: "registrar_atendimento",
  description:
    "USE SEMPRE que o vendedor relatar qualquer contato/conversa/novidade de um cliente. Numa única chamada: encontra (por telefone ou nome) ou cria o lead, " +
    "atualiza os dados do lead, registra o contato na timeline, salva o contexto como nota, agenda compromisso e cria follow-up. " +
    "Se não houver follow_up nem agendamento, o sistema cria um follow-up automático em 2 dias úteis.",
  input_schema: {
    type: "object",
    required: ["resumo"],
    properties: {
      lead_id: { type: "string" },
      nome: { type: "string", description: "nome do cliente como o vendedor falou" },
      telefone: { type: "string" },
      criar_se_nao_existir: { type: "boolean", description: "padrão true" },
      resumo: { type: "string", description: "o que aconteceu, em 1-2 frases objetivas (vai para a timeline)" },
      tipo_contato: { type: "string", enum: ["ligacao", "whatsapp", "email", "visita", "test_drive", "follow_up"], description: "como foi o contato; se não dito, follow_up" },
      contexto: { type: "string", description: "informação qualitativa durável (urgência, motivo, perfil). Vira nota. Omitir se não houver." },
      interesse: { type: "string" },
      orcamento_max: { type: "number" },
      forma_pagamento: { type: "string" },
      troca: { type: "string", description: "veículo do cliente na troca" },
      prazo_compra: { type: "string" },
      temperatura: { type: "string", enum: ["frio", "morno", "quente"] },
      etapa: { type: "string", enum: SETTABLE_STAGES, description: "só se o relato indicar claramente; venda/perda use update_lead" },
      origem: { type: "string" },
      veiculo_codigo: { type: "string", description: "código de estoque (ex. V036) do carro de interesse, se identificado" },
      veiculo_id: { type: "string" },
      follow_up: { type: "object", properties: { titulo: { type: "string" }, quando: { type: "string", description: "ISO 8601 -03:00" } } },
      agendamento: {
        type: "object",
        properties: { titulo: { type: "string" }, tipo: { type: "string", enum: APPT_TYPES }, inicio: { type: "string", description: "ISO 8601 -03:00" }, local: { type: "string" } },
      },
    },
  },
};

export async function registerInteraction(a: Json, ctx: ToolContext): Promise<Json> {
  const sb = ctx.supabase;
  const feito: string[] = [];
  const nome = str(a.nome, 120);
  const tel = digits(a.telefone);

  // 1) localizar lead: id → telefone → nome
  let lead: Json | null = null;
  if (uuid(a.lead_id)) {
    const { data } = await sb.from("leads").select("*").eq("id", uuid(a.lead_id)!).maybeSingle();
    lead = data;
  }
  if (!lead && tel.length >= 8) {
    const { data } = await sb.from("leads").select("*").ilike("phone", `%${tel.slice(-8)}%`).order("updated_at", { ascending: false }).limit(3);
    const open = (data ?? []).filter((l) => OPEN_STAGES.includes(l.stage));
    lead = open[0] ?? data?.[0] ?? null;
  }
  if (!lead && nome) {
    const clean = nome.replace(/[%_,()"'*:\\]/g, " ").trim();
    const { data } = await sb.from("leads").select("*").ilike("name", `%${clean}%`).order("updated_at", { ascending: false }).limit(6);
    const pool = (data ?? []).filter((l) => OPEN_STAGES.includes(l.stage));
    const cands = pool.length ? pool : data ?? [];
    const exact = cands.filter((l) => String(l.name).trim().toLowerCase() === nome.toLowerCase());
    if (exact.length === 1) lead = exact[0];
    else if (cands.length === 1) lead = cands[0];
    else if (cands.length > 1) {
      return { ok: false, status: "ambiguous", pergunta: "Qual deles?", candidatos: cands.map((l) => ({ id: l.id, nome: l.name, telefone: l.phone, etapa: stageLabel(String(l.stage)), interesse: l.interest })) };
    }
  }

  // 2) veículo de interesse
  let vehicleId = uuid(a.veiculo_id);
  if (!vehicleId && str(a.veiculo_codigo)) {
    const { data } = await sb.from("vehicles").select("id").ilike("stock_code", str(a.veiculo_codigo, 20)!).maybeSingle();
    vehicleId = data?.id ?? null;
  }

  // 3) campos do lead
  const patch: Json = {};
  const map: [string, string, number][] = [["interesse", "interest", 200], ["forma_pagamento", "payment_method", 120], ["troca", "trade_in", 200], ["prazo_compra", "purchase_timeframe", 60], ["origem", "source", 60]];
  for (const [k, col, max] of map) if (str(a[k])) patch[col] = str(a[k], max);
  if (num(a.orcamento_max) !== null) patch.budget_max = num(a.orcamento_max);
  if (["frio", "morno", "quente"].includes(String(a.temperatura))) patch.temperature = a.temperatura;
  if (vehicleId) patch.vehicle_id = vehicleId;
  if (tel && !lead?.phone) patch.phone = str(a.telefone, 30);

  let created = false;
  if (!lead) {
    if (a.criar_se_nao_existir === false) return { ok: false, error: "Lead não encontrado." };
    if (!nome) return { ok: false, error: "Informe o nome do cliente para criar o lead." };
    const { data, error } = await sb.from("leads").insert({ ...patch, name: nome, team_id: ctx.teamId, owner_id: ctx.userId }).select("*").single();
    if (error) return { ok: false, error: "Não foi possível criar o lead." };
    lead = data; created = true;
    feito.push(`lead ${nome} criado`);
  } else if (Object.keys(patch).length) {
    const { data } = await sb.from("leads").update(patch).eq("id", lead.id as string).select("*").single();
    if (data) lead = data;
    feito.push(`lead atualizado (${Object.keys(patch).map((c) => ({ interest: "interesse", budget_max: "orçamento", payment_method: "pagamento", trade_in: "troca", purchase_timeframe: "prazo", temperature: "temperatura", vehicle_id: "veículo", phone: "telefone", source: "origem" } as Json)[c] ?? c).join(", ")})`);
  }
  const leadId = lead!.id as string;
  const customerId = (lead!.customer_id as string | null) ?? null;

  // 4) contato na timeline
  const tipo = CONTACT_TITLES[String(a.tipo_contato)] ? String(a.tipo_contato) : "follow_up";
  const resumo = str(a.resumo, 2000);
  await sb.from("activities").insert({
    team_id: ctx.teamId, owner_id: ctx.userId, lead_id: leadId, customer_id: customerId, vehicle_id: vehicleId,
    type: tipo, title: CONTACT_TITLES[tipo], description: resumo,
  });
  feito.push("contato registrado");

  // 5) contexto qualitativo
  const contexto = str(a.contexto, 2000);
  if (contexto) {
    await sb.from("notes").insert({ team_id: ctx.teamId, owner_id: ctx.userId, lead_id: leadId, customer_id: customerId, content: contexto });
    feito.push("contexto salvo");
  }

  // 6) agendamento
  let nextAt: string | null = null, nextTitle: string | null = null;
  const ag = (a.agendamento ?? null) as Json | null;
  const agInicio = ag ? iso(ag.inicio) : null;
  if (ag && agInicio) {
    const tipoAg = APPT_TYPES.includes(String(ag.tipo)) ? String(ag.tipo) : "visita";
    const titulo = str(ag.titulo, 200) ?? `${tipoAg === "test_drive" ? "Test-drive" : "Visita"} — ${lead!.name}`;
    await sb.from("appointments").insert({
      team_id: ctx.teamId, owner_id: ctx.userId, lead_id: leadId, customer_id: customerId, vehicle_id: vehicleId ?? (lead!.vehicle_id as string | null),
      title: titulo, type: tipoAg, starts_at: agInicio, location: str(ag.local, 200),
    });
    nextAt = agInicio; nextTitle = titulo;
    feito.push(`${tipoAg === "test_drive" ? "test-drive" : tipoAg} agendado(a)`);
  }

  // 7) follow-up (explícito ou automático)
  const fu = (a.follow_up ?? null) as Json | null;
  const fuQuando = fu ? iso(fu.quando) : null;
  let autoFu = false;
  if (fu && (fuQuando || str(fu.titulo))) {
    const due = fuQuando ?? businessDaysAhead(2);
    const titulo = str(fu.titulo, 200) ?? `Retornar para ${lead!.name}`;
    await sb.from("tasks").insert({ team_id: ctx.teamId, owner_id: ctx.userId, lead_id: leadId, customer_id: customerId, title: titulo, due_at: due, priority: lead!.temperature === "quente" ? "alta" : "media" });
    if (!nextAt || due < nextAt) { nextAt = due; nextTitle = titulo; }
    feito.push("follow-up criado");
  } else if (!agInicio) {
    // já existe follow-up pendente? não duplica
    const { data: open } = await sb.from("tasks").select("title,due_at").eq("lead_id", leadId).eq("status", "pendente")
      .gte("due_at", new Date().toISOString()).order("due_at").limit(1);
    if (open?.length) {
      nextAt = open[0].due_at; nextTitle = open[0].title;
      feito.push("follow-up já existente mantido");
    }
  }
  if (!agInicio && !nextAt) {
    const due = businessDaysAhead(2);
    const titulo = `Retornar para ${lead!.name}`;
    await sb.from("tasks").insert({ team_id: ctx.teamId, owner_id: ctx.userId, lead_id: leadId, customer_id: customerId, title: titulo, due_at: due, priority: lead!.temperature === "quente" ? "alta" : "media" });
    nextAt = due; nextTitle = titulo; autoFu = true;
    feito.push("follow-up automático em 2 dias úteis");
  }

  // 8) etapa + próxima ação
  const stagePatch: Json = {};
  if (nextAt) { stagePatch.next_action = nextTitle; stagePatch.next_action_at = nextAt; }
  const etapa = SETTABLE_STAGES.includes(String(a.etapa)) ? String(a.etapa) : null;
  if (etapa && etapa !== lead!.stage) stagePatch.stage = etapa;
  else if (agInicio && ["novo", "primeiro_contato", "atendimento", "qualificado", "sem_resposta"].includes(String(lead!.stage))) stagePatch.stage = "visita";
  else if (lead!.stage === "novo") stagePatch.stage = "primeiro_contato";
  if (Object.keys(stagePatch).length) await sb.from("leads").update(stagePatch).eq("id", leadId);
  if (stagePatch.stage) feito.push(`etapa → ${stageLabel(String(stagePatch.stage))}`);

  // 9) alerta: outro cliente quer o mesmo carro
  let alerta: string | null = null;
  const vid = vehicleId ?? (lead!.vehicle_id as string | null);
  if (vid) {
    const { data } = await sb.from("leads").select("name,stage").eq("vehicle_id", vid).neq("id", leadId).in("stage", OPEN_STAGES);
    if (data?.length) alerta = `Outro(s) cliente(s) interessado(s) no mesmo veículo: ${data.map((d) => `${d.name} (${stageLabel(d.stage)})`).join(", ")}.`;
  }

  return {
    ok: true,
    lead: { id: leadId, nome: lead!.name, etapa: stageLabel(String(stagePatch.stage ?? lead!.stage)), criado: created },
    feito,
    proxima_acao: nextAt ? { o_que: nextTitle, quando: nextAt, automatica: autoFu } : null,
    ...(alerta ? { alerta } : {}),
  };
}
