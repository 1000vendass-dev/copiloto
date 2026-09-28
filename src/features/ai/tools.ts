import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { OPEN_STAGES, STAGE_VALUES, stageLabel } from "@/features/crm/constants";
import { sanitizeSearch } from "@/features/crm/queries";
import { parseVehicleQuery, type VehicleQuery } from "@/features/inventory/parse-query";
import { searchVehicles } from "@/features/inventory/queries";
import { getCallList } from "@/features/routine/queries";
import { dayRangeSP, todaySP } from "@/lib/dates";

export type ToolContext = {
  supabase: SupabaseClient;
  userId: string;
  teamId: string;
  /** true quando a última mensagem do usuário é uma confirmação explícita ("sim", "confirmo"...) */
  userConfirmed: boolean;
};

type Json = Record<string, unknown>;
type Tool = {
  name: string;
  description: string;
  input_schema: Json;
  /** ações de alto risco exigem confirmação explícita do usuário no chat */
  risk?: "high";
  run: (args: Json, ctx: ToolContext) => Promise<Json>;
};

/* ------------------------------ helpers ------------------------------ */
const str = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) { const n = Number(v.replace(/[R$\s.]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; }
  return null;
};
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const iso = (v: unknown) => {
  const s = str(v, 40);
  if (!s) return null;
  const withTz = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.length === 10 ? s + "T09:00:00" : s}-03:00`;
  const d = new Date(withTz);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const fail = (error: string): Json => ({ ok: false, error });
function needsConfirmation(ctx: ToolContext, args: Json, summary: string): Json | null {
  if (args.confirmed === true && ctx.userConfirmed) return null;
  return { ok: false, status: "needs_confirmation", summary, instruction: "Descreva a ação ao usuário e peça confirmação explícita (ex.: 'Confirma?'). Só chame de novo com confirmed=true depois que ele responder 'sim'." };
}
const leadBrief = (l: Json) => ({
  id: l.id, nome: l.name, telefone: l.phone, etapa: stageLabel(String(l.stage)), temperatura: l.temperature,
  interesse: l.interest, orcamento_max: l.budget_max, prazo: l.purchase_timeframe, pagamento: l.payment_method, troca: l.trade_in,
  proxima_acao: l.next_action, proxima_acao_em: l.next_action_at, ultimo_contato: l.last_contact_at, cliente_id: l.customer_id, veiculo_id: l.vehicle_id,
});
const vehicleBrief = (v: Json) => ({
  id: v.id, codigo: v.stock_code, veiculo: `${v.brand} ${v.model} ${v.version ?? ""}`.trim(), ano: v.year_manufacture && v.year_model ? `${v.year_manufacture}/${v.year_model}` : v.year_model,
  km: v.km, cambio: v.transmission, combustivel: v.fuel, carroceria: v.body_type, cor: v.color, preco: v.sale_price, status: v.status, loja: v.store,
});

async function resolveLead(ctx: ToolContext, args: Json): Promise<{ id: string } | Json> {
  const id = uuid(args.lead_id);
  if (id) return { id };
  const name = str(args.lead_name ?? args.name, 80);
  if (!name) return fail("Informe lead_id ou lead_name.");
  const { data } = await ctx.supabase.from("leads").select("id,name,phone,stage,interest,updated_at")
    .ilike("name", `%${sanitizeSearch(name)}%`).order("updated_at", { ascending: false }).limit(6);
  if (!data?.length) return fail(`Nenhum lead encontrado com o nome "${name}".`);
  const open = data.filter((d) => OPEN_STAGES.includes(d.stage));
  const pool = open.length ? open : data;
  const exact = pool.filter((d) => d.name.trim().toLowerCase() === name.toLowerCase());
  if (exact.length === 1) return { id: exact[0].id };
  if (pool.length > 1) {
    // vários com nome parecido: devolve candidatos para a IA perguntar qual é
    return { ok: false, status: "ambiguous", candidatos: pool.map((d) => ({ id: d.id, nome: d.name, telefone: d.phone, etapa: stageLabel(d.stage), interesse: d.interest })) };
  }
  return { id: pool[0].id };
}

/** Outros leads em aberto interessados no mesmo veículo (para a IA avisar o vendedor). */
async function vehicleConflict(ctx: ToolContext, vehicleId: string | null, exceptLeadId: string): Promise<string | null> {
  if (!vehicleId) return null;
  const { data } = await ctx.supabase.from("leads").select("name,stage").eq("vehicle_id", vehicleId).neq("id", exceptLeadId).in("stage", OPEN_STAGES);
  if (!data?.length) return null;
  return `Atenção: este veículo também interessa a ${data.map((d) => `${d.name} (${stageLabel(d.stage)})`).join(", ")}. Avise o vendedor.`;
}

/* ------------------------------ tools ------------------------------ */
const leadFields = {
  name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, source: { type: "string", description: "origem: WhatsApp, Instagram, OLX, Loja, Indicação..." },
  interest: { type: "string", description: "o que o cliente procura, ex.: 'Onix automático'" },
  budget_max: { type: "number", description: "orçamento máximo em reais" },
  payment_method: { type: "string" }, trade_in: { type: "string", description: "veículo na troca" },
  purchase_timeframe: { type: "string", description: "prazo de compra, ex.: 'outubro'" },
  temperature: { type: "string", enum: ["frio", "morno", "quente"] },
  next_action: { type: "string" }, next_action_at: { type: "string", description: "ISO 8601 com -03:00" },
  vehicle_id: { type: "string", description: "id de veículo do estoque" },
};

function pickLead(args: Json) {
  const out: Json = {};
  for (const k of ["name", "phone", "email", "source", "interest", "payment_method", "trade_in", "purchase_timeframe", "next_action"]) {
    if (args[k] !== undefined) out[k] = str(args[k], 200);
  }
  if (args.budget_max !== undefined) out.budget_max = num(args.budget_max);
  if (args.temperature !== undefined) out.temperature = ["frio", "morno", "quente"].includes(String(args.temperature)) ? args.temperature : null;
  if (args.next_action_at !== undefined) out.next_action_at = iso(args.next_action_at);
  if (args.vehicle_id !== undefined) out.vehicle_id = uuid(args.vehicle_id);
  return out;
}

export const TOOLS: Tool[] = [
  {
    name: "search_leads",
    description: "Busca leads (negociações) por nome, telefone ou interesse. Por padrão só os em aberto.",
    input_schema: { type: "object", properties: { query: { type: "string" }, stage: { type: "string", enum: [...STAGE_VALUES, "todos"] }, temperature: { type: "string", enum: ["frio", "morno", "quente"] }, limit: { type: "integer" } } },
    run: async (a, ctx) => {
      let q = ctx.supabase.from("leads").select("*").order("updated_at", { ascending: false }).limit(Math.min(Number(a.limit) || 20, 50));
      if (a.stage && a.stage !== "todos") q = q.eq("stage", String(a.stage)); else if (!a.stage) q = q.in("stage", OPEN_STAGES);
      if (a.temperature) q = q.eq("temperature", String(a.temperature));
      const s = a.query ? sanitizeSearch(String(a.query)) : "";
      if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,interest.ilike.%${s}%`);
      const { data, error } = await q;
      if (error) return fail("Erro ao buscar leads.");
      return { ok: true, total: data.length, leads: data.map(leadBrief) };
    },
  },
  {
    name: "get_lead",
    description: "Contexto completo de um lead: dados, timeline recente, notas, tarefas pendentes, compromissos e memórias. Aceita lead_id ou lead_name.",
    input_schema: { type: "object", properties: { lead_id: { type: "string" }, lead_name: { type: "string" } } },
    run: async (a, ctx) => {
      const r = await resolveLead(ctx, a);
      if (!("id" in r)) return r;
      const id = r.id as string;
      const [lead, acts, notes, tasks, appts, mem] = await Promise.all([
        ctx.supabase.from("leads").select("*").eq("id", id).maybeSingle(),
        ctx.supabase.from("activities").select("type,title,description,occurred_at").eq("lead_id", id).order("occurred_at", { ascending: false }).limit(15),
        ctx.supabase.from("notes").select("content,created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(10),
        ctx.supabase.from("tasks").select("id,title,due_at,priority").eq("lead_id", id).eq("status", "pendente").order("due_at"),
        ctx.supabase.from("appointments").select("id,title,type,starts_at,status").eq("lead_id", id).gte("starts_at", new Date(Date.now() - 86400000).toISOString()).order("starts_at"),
        ctx.supabase.from("ai_memory").select("content,importance").eq("lead_id", id).order("importance", { ascending: false }).limit(10),
      ]);
      if (!lead.data) return fail("Lead não encontrado.");
      let vehicle: Json | null = null;
      if (lead.data.vehicle_id) {
        const { data } = await ctx.supabase.from("vehicles").select("*").eq("id", lead.data.vehicle_id).maybeSingle();
        vehicle = data ? vehicleBrief(data) : null;
      }
      return { ok: true, lead: leadBrief(lead.data), veiculo_de_interesse: vehicle, timeline: acts.data, notas: notes.data, tarefas_pendentes: tasks.data, compromissos: appts.data, memorias: mem.data };
    },
  },
  {
    name: "create_lead",
    description: "Cria um novo lead. Antes, use search_leads para evitar duplicado. O campo notes JÁ vira nota (não chame create_note depois). Se o usuário relatou uma conversa, informe contact_type para registrar o contato na timeline no mesmo passo.",
    input_schema: { type: "object", required: ["name"], properties: {
      ...leadFields,
      stage: { type: "string", enum: ["novo", "primeiro_contato", "atendimento", "qualificado", "visita", "proposta", "negociacao", "sem_resposta"] },
      notes: { type: "string", description: "contexto da conversa, vira nota" },
      contact_type: { type: "string", enum: ["ligacao", "whatsapp", "email", "visita", "follow_up"], description: "se houve conversa, registra o contato" },
      contact_summary: { type: "string", description: "resumo do que foi conversado" },
    } },
    run: async (a, ctx) => {
      const row = pickLead(a);
      if (!row.name) return fail("Nome é obrigatório.");
      const stage = ["novo", "primeiro_contato", "atendimento", "qualificado", "visita", "proposta", "negociacao", "sem_resposta"].includes(String(a.stage)) ? String(a.stage) : undefined;
      const { data, error } = await ctx.supabase.from("leads").insert({ ...row, ...(stage ? { stage } : {}), team_id: ctx.teamId, owner_id: ctx.userId }).select("*").single();
      if (error) return fail("Não foi possível criar o lead.");
      const note = str(a.notes, 2000);
      if (note) await ctx.supabase.from("notes").insert({ team_id: ctx.teamId, owner_id: ctx.userId, lead_id: data.id, content: note });
      const ct = String(a.contact_type ?? "");
      const titles: Record<string, string> = { ligacao: "Ligação registrada", whatsapp: "Conversa no WhatsApp", email: "E-mail enviado", visita: "Visita na loja", follow_up: "Follow-up" };
      if (titles[ct]) {
        await ctx.supabase.from("activities").insert({ team_id: ctx.teamId, owner_id: ctx.userId, lead_id: data.id, type: ct, title: titles[ct], description: str(a.contact_summary, 2000) ?? note });
        if (!stage || stage === "novo") await ctx.supabase.from("leads").update({ stage: "primeiro_contato" }).eq("id", data.id).eq("stage", "novo");
      }
      const alerta = await vehicleConflict(ctx, (row.vehicle_id as string | null) ?? null, data.id);
      return { ok: true, criado: leadBrief(data), contato_registrado: Boolean(titles[ct]), ...(alerta ? { alerta } : {}) };
    },
  },
  {
    name: "update_lead",
    description: "Atualiza dados de um lead (interesse, orçamento, prazo, temperatura, próxima ação, etapa...). Mudar etapa para 'venda' ou 'perdido' exige confirmação.",
    input_schema: { type: "object", properties: { lead_id: { type: "string" }, lead_name: { type: "string" }, ...leadFields, stage: { type: "string", enum: STAGE_VALUES }, lost_reason: { type: "string" }, closed_value: { type: "number" }, confirmed: { type: "boolean" } } },
    run: async (a, ctx) => {
      const r = await resolveLead(ctx, a);
      if (!("id" in r)) return r;
      const patch = pickLead(a);
      delete patch.name;
      if (a.name !== undefined && str(a.name)) patch.name = str(a.name);
      if (a.stage !== undefined) {
        if (!(STAGE_VALUES as string[]).includes(String(a.stage))) return fail("Etapa inválida.");
        if (["venda", "perdido"].includes(String(a.stage))) {
          const c = needsConfirmation(ctx, a, `Marcar o lead como ${stageLabel(String(a.stage))}`);
          if (c) return c;
        }
        patch.stage = a.stage;
        if (a.stage === "perdido") patch.lost_reason = str(a.lost_reason, 300);
        if (a.stage === "venda" && a.closed_value !== undefined) patch.closed_value = num(a.closed_value);
      }
      if (!Object.keys(patch).length) return fail("Nada para atualizar.");
      const { data, error } = await ctx.supabase.from("leads").update(patch).eq("id", r.id as string).select("*").maybeSingle();
      if (error || !data) return fail("Não foi possível atualizar o lead.");
      const alerta = patch.vehicle_id ? await vehicleConflict(ctx, patch.vehicle_id as string, data.id) : null;
      return { ok: true, atualizado: leadBrief(data), campos: Object.keys(patch), ...(alerta ? { alerta } : {}) };
    },
  },
  {
    name: "search_customers",
    description: "Busca clientes cadastrados por nome, telefone, e-mail ou cidade.",
    input_schema: { type: "object", properties: { query: { type: "string" } } },
    run: async (a, ctx) => {
      const s = sanitizeSearch(String(a.query ?? ""));
      let q = ctx.supabase.from("customers").select("id,name,phone,email,city").order("name").limit(20);
      if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,city.ilike.%${s}%`);
      const { data, error } = await q;
      return error ? fail("Erro ao buscar clientes.") : { ok: true, clientes: data };
    },
  },
  {
    name: "get_customer",
    description: "Dados de um cliente, suas negociações e timeline recente.",
    input_schema: { type: "object", required: ["customer_id"], properties: { customer_id: { type: "string" } } },
    run: async (a, ctx) => {
      const id = uuid(a.customer_id);
      if (!id) return fail("customer_id inválido.");
      const [c, leads, acts] = await Promise.all([
        ctx.supabase.from("customers").select("*").eq("id", id).maybeSingle(),
        ctx.supabase.from("leads").select("*").eq("customer_id", id),
        ctx.supabase.from("activities").select("type,title,description,occurred_at").eq("customer_id", id).order("occurred_at", { ascending: false }).limit(15),
      ]);
      if (!c.data) return fail("Cliente não encontrado.");
      return { ok: true, cliente: c.data, negociacoes: (leads.data ?? []).map(leadBrief), timeline: acts.data };
    },
  },
  {
    name: "create_customer",
    description: "Cadastra um cliente. Se lead_id for informado, vincula o lead a ele.",
    input_schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, city: { type: "string" }, notes: { type: "string" }, lead_id: { type: "string" } } },
    run: async (a, ctx) => {
      const name = str(a.name, 120);
      if (!name) return fail("Nome é obrigatório.");
      const { data, error } = await ctx.supabase.from("customers").insert({
        team_id: ctx.teamId, owner_id: ctx.userId, name, phone: str(a.phone, 30), email: str(a.email, 160), city: str(a.city, 80), notes: str(a.notes, 2000),
      }).select("id,name").single();
      if (error) return fail("Não foi possível cadastrar o cliente.");
      const leadId = uuid(a.lead_id);
      if (leadId) await ctx.supabase.from("leads").update({ customer_id: data.id }).eq("id", leadId);
      return { ok: true, cliente: data };
    },
  },
  {
    name: "update_customer",
    description: "Atualiza dados de um cliente.",
    input_schema: { type: "object", required: ["customer_id"], properties: { customer_id: { type: "string" }, name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, city: { type: "string" }, notes: { type: "string" } } },
    run: async (a, ctx) => {
      const id = uuid(a.customer_id);
      if (!id) return fail("customer_id inválido.");
      const patch: Json = {};
      for (const k of ["name", "phone", "email", "city", "notes"]) if (a[k] !== undefined) patch[k] = str(a[k], k === "notes" ? 2000 : 160);
      if (patch.name === null) delete patch.name;
      const { data, error } = await ctx.supabase.from("customers").update(patch).eq("id", id).select("id,name").maybeSingle();
      return error || !data ? fail("Não foi possível atualizar.") : { ok: true, cliente: data };
    },
  },
  {
    name: "search_vehicles",
    description: "Consulta o ESTOQUE REAL. Aceita busca em linguagem simples ('onix até 80 mil', 'SUV automático 2020 a 2023') e/ou filtros. Por padrão só veículos disponíveis.",
    input_schema: { type: "object", properties: {
      query: { type: "string" }, price_max: { type: "number" }, price_min: { type: "number" }, year_min: { type: "integer" }, year_max: { type: "integer" },
      transmission: { type: "string", enum: ["automatico", "manual"] }, body_type: { type: "string", enum: ["hatch", "sedan", "suv", "picape", "minivan", "utilitario", "moto"] },
      status: { type: "string", enum: ["disponivel", "reservado", "vendido", "todos"] }, store: { type: "string" },
      sort: { type: "string", enum: ["preco_asc", "preco_desc", "ano_desc", "km_asc"] }, limit: { type: "integer" } } },
    run: async (a) => {
      const parsed = parseVehicleQuery(String(a.query ?? ""));
      const q: VehicleQuery = {
        ...parsed,
        terms: parsed.terms.map((t) => sanitizeSearch(t).toLowerCase()).filter(Boolean),
        priceMax: num(a.price_max) ?? parsed.priceMax, priceMin: num(a.price_min) ?? parsed.priceMin,
        yearMin: num(a.year_min) ?? parsed.yearMin, yearMax: num(a.year_max) ?? parsed.yearMax,
        transmission: (a.transmission as VehicleQuery["transmission"]) ?? parsed.transmission,
        bodyType: str(a.body_type) ?? parsed.bodyType,
      };
      const { vehicles, count, error } = await searchVehicles(q, {
        status: str(a.status) ?? "disponivel", store: str(a.store) ?? undefined, sort: str(a.sort) ?? "preco_asc", limit: Math.min(Number(a.limit) || 15, 40),
      });
      if (error) return fail("Erro ao consultar o estoque.");
      return { ok: true, total_encontrado: count, filtros_aplicados: { ...q, status: a.status ?? "disponivel" }, veiculos: vehicles.map(vehicleBrief) };
    },
  },
  {
    name: "get_vehicle",
    description: "Ficha de um veículo do estoque (por id ou código, ex. V097), com opcionais e leads interessados.",
    input_schema: { type: "object", properties: { vehicle_id: { type: "string" }, stock_code: { type: "string" } } },
    run: async (a, ctx) => {
      let q = ctx.supabase.from("vehicles").select("*");
      const id = uuid(a.vehicle_id);
      if (id) q = q.eq("id", id); else if (str(a.stock_code)) q = q.ilike("stock_code", str(a.stock_code)!); else return fail("Informe vehicle_id ou stock_code.");
      const { data: v } = await q.maybeSingle();
      if (!v) return fail("Veículo não encontrado.");
      const [f, l] = await Promise.all([
        ctx.supabase.from("vehicle_features").select("name").eq("vehicle_id", v.id),
        ctx.supabase.from("leads").select("id,name,stage").eq("vehicle_id", v.id),
      ]);
      return { ok: true, veiculo: { ...vehicleBrief(v), motor: v.engine, portas: v.doors, placa: v.plate, descricao: v.description }, opcionais: (f.data ?? []).map((x) => x.name), leads_interessados: l.data };
    },
  },
  {
    name: "update_vehicle",
    description: "Altera status (disponivel/reservado/vendido) ou preço de um veículo. SEMPRE exige confirmação do usuário.",
    risk: "high",
    input_schema: { type: "object", required: ["vehicle_id"], properties: { vehicle_id: { type: "string" }, status: { type: "string", enum: ["disponivel", "reservado", "vendido"] }, sale_price: { type: "number" }, lead_id: { type: "string" }, confirmed: { type: "boolean" } } },
    run: async (a, ctx) => {
      const id = uuid(a.vehicle_id);
      if (!id) return fail("vehicle_id inválido.");
      const c = needsConfirmation(ctx, a, `Alterar veículo: ${a.status ? "status → " + a.status : ""} ${a.sale_price ? "preço → R$ " + a.sale_price : ""}`.trim());
      if (c) return c;
      const patch: Json = {};
      if (a.status) patch.status = a.status;
      if (a.sale_price !== undefined) patch.sale_price = num(a.sale_price);
      const leadId = uuid(a.lead_id);
      if (a.status === "reservado" && leadId) patch.reserved_lead_id = leadId;
      if (a.status === "vendido") { patch.sold_at = todaySP(); if (leadId) patch.sold_lead_id = leadId; }
      const { data, error } = await ctx.supabase.from("vehicles").update(patch).eq("id", id).select("*").maybeSingle();
      return error || !data ? fail("Não foi possível alterar o veículo.") : { ok: true, veiculo: vehicleBrief(data) };
    },
  },
  {
    name: "create_task",
    description: "Cria tarefa / follow-up / lembrete. Use due_at em ISO com -03:00. Informe lead_id ou lead_name quando for sobre um cliente.",
    input_schema: { type: "object", required: ["title"], properties: { title: { type: "string" }, due_at: { type: "string" }, priority: { type: "string", enum: ["baixa", "media", "alta"] }, lead_id: { type: "string" }, lead_name: { type: "string" }, description: { type: "string" } } },
    run: async (a, ctx) => {
      const title = str(a.title, 200);
      if (!title) return fail("Título obrigatório.");
      let leadId: string | null = null, customerId: string | null = null;
      if (a.lead_id || a.lead_name) {
        const r = await resolveLead(ctx, a);
        if (!("id" in r)) return r;
        leadId = r.id as string;
        const { data } = await ctx.supabase.from("leads").select("customer_id,next_action_at").eq("id", leadId).maybeSingle();
        customerId = data?.customer_id ?? null;
      }
      const dueAt = iso(a.due_at);
      const { data, error } = await ctx.supabase.from("tasks").insert({
        team_id: ctx.teamId, owner_id: ctx.userId, title, due_at: dueAt, lead_id: leadId, customer_id: customerId,
        priority: ["baixa", "media", "alta"].includes(String(a.priority)) ? a.priority : "media", description: str(a.description, 2000),
      }).select("id,title,due_at,priority").single();
      if (error) return fail("Não foi possível criar a tarefa.");
      if (leadId && dueAt) await ctx.supabase.from("leads").update({ next_action: title, next_action_at: dueAt }).eq("id", leadId);
      return { ok: true, tarefa: data, lead_id: leadId };
    },
  },
  {
    name: "update_task",
    description: "Altera título, data ou prioridade de uma tarefa.",
    input_schema: { type: "object", required: ["task_id"], properties: { task_id: { type: "string" }, title: { type: "string" }, due_at: { type: "string" }, priority: { type: "string", enum: ["baixa", "media", "alta"] } } },
    run: async (a, ctx) => {
      const id = uuid(a.task_id);
      if (!id) return fail("task_id inválido.");
      const patch: Json = {};
      if (str(a.title)) patch.title = str(a.title, 200);
      if (a.due_at !== undefined) patch.due_at = iso(a.due_at);
      if (a.priority) patch.priority = a.priority;
      const { data, error } = await ctx.supabase.from("tasks").update(patch).eq("id", id).select("id,title,due_at,priority,status").maybeSingle();
      return error || !data ? fail("Não foi possível alterar a tarefa.") : { ok: true, tarefa: data };
    },
  },
  {
    name: "complete_task",
    description: "Marca uma tarefa como concluída.",
    input_schema: { type: "object", required: ["task_id"], properties: { task_id: { type: "string" } } },
    run: async (a, ctx) => {
      const id = uuid(a.task_id);
      if (!id) return fail("task_id inválido.");
      const { data, error } = await ctx.supabase.from("tasks").update({ status: "concluida" }).eq("id", id).select("id,title").maybeSingle();
      return error || !data ? fail("Não foi possível concluir.") : { ok: true, concluida: data };
    },
  },
  {
    name: "search_tasks",
    description: "Lista tarefas pendentes: atrasadas, de hoje, futuras ou todas; opcionalmente de um lead.",
    input_schema: { type: "object", properties: { range: { type: "string", enum: ["atrasadas", "hoje", "futuras", "todas"] }, lead_id: { type: "string" } } },
    run: async (a, ctx) => {
      const { end } = dayRangeSP(todaySP());
      const now = new Date().toISOString();
      let q = ctx.supabase.from("tasks").select("id,title,due_at,priority,lead_id,leads(name)").eq("status", "pendente").order("due_at", { nullsFirst: false }).limit(50);
      if (a.range === "atrasadas") q = q.lt("due_at", now);
      else if (a.range === "hoje") q = q.gte("due_at", now).lt("due_at", end);
      else if (a.range === "futuras") q = q.gte("due_at", end);
      const lid = uuid(a.lead_id);
      if (lid) q = q.eq("lead_id", lid);
      const { data, error } = await q;
      return error ? fail("Erro ao buscar tarefas.") : { ok: true, tarefas: data };
    },
  },
  {
    name: "create_appointment",
    description: "Agenda compromisso (visita, test-drive, ligação, reunião, entrega). starts_at em ISO com -03:00.",
    input_schema: { type: "object", required: ["title", "starts_at"], properties: { title: { type: "string" }, type: { type: "string", enum: ["visita", "test_drive", "ligacao", "reuniao", "entrega", "outro"] }, starts_at: { type: "string" }, ends_at: { type: "string" }, location: { type: "string" }, lead_id: { type: "string" }, lead_name: { type: "string" }, vehicle_id: { type: "string" }, notes: { type: "string" } } },
    run: async (a, ctx) => {
      const startsAt = iso(a.starts_at);
      if (!startsAt || !str(a.title)) return fail("Título e data/hora são obrigatórios.");
      let leadId: string | null = null, customerId: string | null = null;
      if (a.lead_id || a.lead_name) {
        const r = await resolveLead(ctx, a);
        if (!("id" in r)) return r;
        leadId = r.id as string;
        const { data } = await ctx.supabase.from("leads").select("customer_id").eq("id", leadId).maybeSingle();
        customerId = data?.customer_id ?? null;
      }
      const type = ["visita", "test_drive", "ligacao", "reuniao", "entrega", "outro"].includes(String(a.type)) ? String(a.type) : "visita";
      const { data, error } = await ctx.supabase.from("appointments").insert({
        team_id: ctx.teamId, owner_id: ctx.userId, title: str(a.title, 200), type, starts_at: startsAt, ends_at: iso(a.ends_at),
        location: str(a.location, 200), notes: str(a.notes, 2000), lead_id: leadId, customer_id: customerId, vehicle_id: uuid(a.vehicle_id),
      }).select("id,title,type,starts_at").single();
      if (error) return fail("Não foi possível agendar.");
      if (leadId) {
        const { data: l } = await ctx.supabase.from("leads").select("next_action_at").eq("id", leadId).maybeSingle();
        if (!l?.next_action_at || l.next_action_at > startsAt || l.next_action_at < new Date().toISOString()) {
          await ctx.supabase.from("leads").update({ next_action: str(a.title, 200), next_action_at: startsAt }).eq("id", leadId);
        }
      }
      if (leadId && ["visita", "test_drive"].includes(type)) {
        await ctx.supabase.from("leads").update({ stage: "visita" }).eq("id", leadId).in("stage", ["novo", "primeiro_contato", "atendimento", "qualificado", "sem_resposta"]);
      }
      return { ok: true, compromisso: data };
    },
  },
  {
    name: "search_appointments",
    description: "Lista compromissos num período (padrão: hoje) ou de um lead.",
    input_schema: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD (inclusivo)" }, lead_id: { type: "string" } } },
    run: async (a, ctx) => {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(a.from)) ? String(a.from) : todaySP();
      const to = /^\d{4}-\d{2}-\d{2}$/.test(String(a.to)) ? String(a.to) : from;
      let q = ctx.supabase.from("appointments").select("id,title,type,starts_at,status,location,lead_id,leads(name),vehicles(brand,model,year_model)")
        .gte("starts_at", dayRangeSP(from).start).lt("starts_at", dayRangeSP(to).end).order("starts_at").limit(100);
      const lid = uuid(a.lead_id);
      if (lid) q = q.eq("lead_id", lid);
      const { data, error } = await q;
      return error ? fail("Erro ao buscar agenda.") : { ok: true, compromissos: data };
    },
  },
  {
    name: "create_activity",
    description: "Registra um contato/interação na timeline (ligação, WhatsApp, e-mail, visita, test-drive, follow-up).",
    input_schema: { type: "object", required: ["type"], properties: { lead_id: { type: "string" }, lead_name: { type: "string" }, customer_id: { type: "string" }, type: { type: "string", enum: ["ligacao", "whatsapp", "email", "visita", "test_drive", "follow_up"] }, description: { type: "string" }, occurred_at: { type: "string" } } },
    run: async (a, ctx) => {
      let leadId: string | null = null;
      let customerId = uuid(a.customer_id);
      if (a.lead_id || a.lead_name) {
        const r = await resolveLead(ctx, a);
        if (!("id" in r)) return r;
        leadId = r.id as string;
        const { data } = await ctx.supabase.from("leads").select("customer_id").eq("id", leadId).maybeSingle();
        customerId = customerId ?? data?.customer_id ?? null;
      }
      if (!leadId && !customerId) return fail("Informe o lead ou cliente.");
      const titles: Record<string, string> = { ligacao: "Ligação registrada", whatsapp: "Conversa no WhatsApp", email: "E-mail enviado", visita: "Visita na loja", test_drive: "Test-drive realizado", follow_up: "Follow-up" };
      const type = String(a.type);
      if (!titles[type]) return fail("Tipo inválido.");
      const { error } = await ctx.supabase.from("activities").insert({
        team_id: ctx.teamId, owner_id: ctx.userId, lead_id: leadId, customer_id: customerId, type, title: titles[type],
        description: str(a.description, 2000), occurred_at: iso(a.occurred_at) ?? new Date().toISOString(),
      });
      if (error) return fail("Não foi possível registrar.");
      if (leadId) await ctx.supabase.from("leads").update({ stage: "primeiro_contato" }).eq("id", leadId).eq("stage", "novo");
      return { ok: true, registrado: titles[type], lead_id: leadId };
    },
  },
  {
    name: "search_activities",
    description: "Timeline de um lead ou cliente, ou atividades recentes da equipe.",
    input_schema: { type: "object", properties: { lead_id: { type: "string" }, customer_id: { type: "string" }, limit: { type: "integer" } } },
    run: async (a, ctx) => {
      let q = ctx.supabase.from("activities").select("type,title,description,occurred_at,lead_id,customer_id").order("occurred_at", { ascending: false }).limit(Math.min(Number(a.limit) || 20, 60));
      if (uuid(a.lead_id)) q = q.eq("lead_id", uuid(a.lead_id)!);
      if (uuid(a.customer_id)) q = q.eq("customer_id", uuid(a.customer_id)!);
      const { data, error } = await q;
      return error ? fail("Erro.") : { ok: true, atividades: data };
    },
  },
  {
    name: "create_note",
    description: "Salva uma nota (contexto qualitativo) num lead ou cliente. Ex.: 'usa o carro para trabalhar, tem urgência'.",
    input_schema: { type: "object", required: ["content"], properties: { content: { type: "string" }, lead_id: { type: "string" }, lead_name: { type: "string" }, customer_id: { type: "string" } } },
    run: async (a, ctx) => {
      const content = str(a.content, 4000);
      if (!content) return fail("Nota vazia.");
      let leadId: string | null = null;
      if (a.lead_id || a.lead_name) { const r = await resolveLead(ctx, a); if (!("id" in r)) return r; leadId = r.id as string; }
      const customerId = uuid(a.customer_id);
      if (!leadId && !customerId) return fail("Informe o lead ou cliente.");
      const { error } = await ctx.supabase.from("notes").insert({ team_id: ctx.teamId, owner_id: ctx.userId, lead_id: leadId, customer_id: customerId, content });
      if (error) return fail("Não foi possível salvar a nota.");
      await ctx.supabase.from("activities").insert({ team_id: ctx.teamId, owner_id: ctx.userId, lead_id: leadId, customer_id: customerId, type: "nota", title: "Nota adicionada", description: content.slice(0, 280) });
      return { ok: true };
    },
  },
  {
    name: "search_notes",
    description: "Procura texto nas notas da equipe.",
    input_schema: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
    run: async (a, ctx) => {
      const s = sanitizeSearch(String(a.query ?? ""));
      if (!s) return fail("Informe o texto.");
      const { data, error } = await ctx.supabase.from("notes").select("content,created_at,lead_id,customer_id").ilike("content", `%${s}%`).order("created_at", { ascending: false }).limit(20);
      return error ? fail("Erro.") : { ok: true, notas: data };
    },
  },
  {
    name: "search_proposals",
    description: "Lista propostas, opcionalmente de um lead ou por status.",
    input_schema: { type: "object", properties: { lead_id: { type: "string" }, status: { type: "string", enum: ["rascunho", "enviada", "aceita", "recusada", "expirada"] } } },
    run: async (a, ctx) => {
      let q = ctx.supabase.from("proposals").select("id,status,vehicle_price,discount,down_payment,trade_in_value,financed_amount,installments,installment_value,total,created_at,lead_id,leads(name),vehicles(brand,model,year_model)").order("created_at", { ascending: false }).limit(30);
      if (uuid(a.lead_id)) q = q.eq("lead_id", uuid(a.lead_id)!);
      if (a.status) q = q.eq("status", String(a.status));
      const { data, error } = await q;
      return error ? fail("Erro.") : { ok: true, propostas: data };
    },
  },
  {
    name: "create_proposal",
    description: "Cria proposta para um lead com um veículo. Valores em reais.",
    input_schema: { type: "object", required: ["vehicle_id"], properties: { lead_id: { type: "string" }, lead_name: { type: "string" }, vehicle_id: { type: "string" }, vehicle_price: { type: "number" }, discount: { type: "number" }, down_payment: { type: "number" }, trade_in_description: { type: "string" }, trade_in_value: { type: "number" }, financed_amount: { type: "number" }, installments: { type: "integer" }, installment_value: { type: "number" }, notes: { type: "string" } } },
    run: async (a, ctx) => {
      const r = await resolveLead(ctx, a);
      if (!("id" in r)) return r;
      const vid = uuid(a.vehicle_id);
      if (!vid) return fail("vehicle_id inválido.");
      const { data: v } = await ctx.supabase.from("vehicles").select("sale_price").eq("id", vid).maybeSingle();
      if (!v) return fail("Veículo não encontrado.");
      const { data: lead } = await ctx.supabase.from("leads").select("customer_id").eq("id", r.id as string).maybeSingle();
      const { data, error } = await ctx.supabase.from("proposals").insert({
        team_id: ctx.teamId, owner_id: ctx.userId, lead_id: r.id, customer_id: lead?.customer_id ?? null, vehicle_id: vid,
        vehicle_price: num(a.vehicle_price) ?? v.sale_price, discount: num(a.discount) ?? 0, down_payment: num(a.down_payment) ?? 0,
        trade_in_description: str(a.trade_in_description, 200), trade_in_value: num(a.trade_in_value) ?? 0, financed_amount: num(a.financed_amount) ?? 0,
        installments: num(a.installments), installment_value: num(a.installment_value), notes: str(a.notes, 2000), status: "rascunho",
      }).select("id,total,status").single();
      if (error) return fail("Não foi possível criar a proposta.");
      await ctx.supabase.from("leads").update({ stage: "proposta" }).eq("id", r.id as string).in("stage", ["novo", "primeiro_contato", "atendimento", "qualificado", "visita"]);
      return { ok: true, proposta: data };
    },
  },
  {
    name: "update_proposal",
    description: "Altera status ou valores de uma proposta. Marcar 'aceita' exige confirmação.",
    input_schema: { type: "object", required: ["proposal_id"], properties: { proposal_id: { type: "string" }, status: { type: "string", enum: ["rascunho", "enviada", "aceita", "recusada", "expirada"] }, discount: { type: "number" }, down_payment: { type: "number" }, installments: { type: "integer" }, installment_value: { type: "number" }, confirmed: { type: "boolean" } } },
    run: async (a, ctx) => {
      const id = uuid(a.proposal_id);
      if (!id) return fail("proposal_id inválido.");
      if (a.status === "aceita") { const c = needsConfirmation(ctx, a, "Marcar proposta como aceita"); if (c) return c; }
      const patch: Json = {};
      if (a.status) patch.status = a.status;
      for (const k of ["discount", "down_payment", "installments", "installment_value"]) if (a[k] !== undefined) patch[k] = num(a[k]);
      const { data, error } = await ctx.supabase.from("proposals").update(patch).eq("id", id).select("id,status,total").maybeSingle();
      return error || !data ? fail("Não foi possível alterar.") : { ok: true, proposta: data };
    },
  },
  {
    name: "who_to_call_today",
    description: "Lista priorizada de quem chamar hoje: follow-ups vencidos, próximas ações de hoje, leads quentes, perto de fechar, leads novos sem contato e leads parados.",
    input_schema: { type: "object", properties: { limit: { type: "integer" } } },
    run: async (a) => {
      const list = await getCallList(Math.min(Number(a.limit) || 10, 25));
      return { ok: true, total: list.length, prioridades: list.map((i) => ({ ...leadBrief(i.lead as unknown as Json), motivo: i.reason, pontuacao: i.score })) };
    },
  },
  {
    name: "save_memory",
    description: "Guarda um fato durável que deve ser lembrado (preferência do vendedor, contexto de um cliente). Não use para dados que já têm campo próprio (orçamento, interesse...).",
    input_schema: { type: "object", required: ["content"], properties: { content: { type: "string" }, scope: { type: "string", enum: ["geral", "lead", "cliente", "veiculo", "preferencia"] }, lead_id: { type: "string" }, customer_id: { type: "string" }, vehicle_id: { type: "string" }, importance: { type: "integer", minimum: 1, maximum: 5 } } },
    run: async (a, ctx) => {
      const content = str(a.content, 1000);
      if (!content) return fail("Conteúdo vazio.");
      const { error } = await ctx.supabase.from("ai_memory").insert({
        team_id: ctx.teamId, owner_id: ctx.userId, content, scope: ["geral", "lead", "cliente", "veiculo", "preferencia"].includes(String(a.scope)) ? a.scope : "geral",
        lead_id: uuid(a.lead_id), customer_id: uuid(a.customer_id), vehicle_id: uuid(a.vehicle_id), importance: Math.min(5, Math.max(1, Number(a.importance) || 2)),
      });
      return error ? fail("Não foi possível guardar.") : { ok: true };
    },
  },
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));
export const TOOL_DEFINITIONS = TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
