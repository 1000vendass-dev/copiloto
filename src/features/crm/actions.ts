"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAGE_VALUES } from "./constants";
import { contactSchema, customerSchema, leadSchema, noteSchema, optDateTime } from "./schemas";

export type ActionResult = { ok: boolean; error?: string; id?: string };

const uuid = z.string().uuid();

function formToObject(formData: FormData) {
  const obj: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === "string") obj[k] = v;
  });
  return obj;
}

function dbError(message: string | undefined): string {
  if (!message) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security/i.test(message)) return "Você não tem permissão para esta ação.";
  if (/foreign key/i.test(message)) return "Registro relacionado não encontrado.";
  return "Não foi possível salvar. Tente novamente.";
}

function revalidateCrm(leadId?: string | null, customerId?: string | null) {
  revalidatePath("/leads");
  revalidatePath("/clientes");
  revalidatePath("/");
  if (leadId) revalidatePath(`/leads/${leadId}`);
  if (customerId) revalidatePath(`/clientes/${customerId}`);
}

/* ------------------------------ LEADS ------------------------------ */

export async function createLead(_: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  const parsed = leadSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .insert({ ...parsed.data, team_id: session.teamId, owner_id: session.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: dbError(error.message) };

  revalidateCrm(data.id, parsed.data.customer_id);
  redirect(`/leads/${data.id}`);
}

export async function updateLead(_: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await getSession();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Lead inválido." };
  // etapa e motivo de perda mudam só por changeLeadStage (gera timeline)
  const parsed = leadSchema.omit({ stage: true, lost_reason: true }).safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error, count } = await supabase.from("leads").update(parsed.data, { count: "exact" }).eq("id", id.data);
  if (error || !count) return { ok: false, error: dbError(error?.message) };
  revalidateCrm(id.data, parsed.data.customer_id);
  return { ok: true, id: id.data };
}

export async function changeLeadStage(leadId: string, stage: string, lostReason?: string): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(leadId).success || !(STAGE_VALUES as string[]).includes(stage)) {
    return { ok: false, error: "Dados inválidos." };
  }
  const patch: Record<string, unknown> = { stage };
  if (stage === "perdido") patch.lost_reason = lostReason?.trim() || null;
  const supabase = await createClient();
  const { error, count } = await supabase.from("leads").update(patch, { count: "exact" }).eq("id", leadId);
  if (error || !count) return { ok: false, error: dbError(error?.message) };
  revalidateCrm(leadId);
  return { ok: true };
}

export async function setLeadTemperature(leadId: string, temperature: string | null): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(leadId).success) return { ok: false, error: "Lead inválido." };
  const t = temperature && ["frio", "morno", "quente"].includes(temperature) ? temperature : null;
  const supabase = await createClient();
  const { error } = await supabase.from("leads").update({ temperature: t }).eq("id", leadId);
  if (error) return { ok: false, error: dbError(error.message) };
  revalidateCrm(leadId);
  return { ok: true };
}

/** Ação de alto risco: a UI exige confirmação explícita antes de chamar. */
export async function deleteLead(leadId: string): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(leadId).success) return { ok: false, error: "Lead inválido." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("leads").delete({ count: "exact" }).eq("id", leadId);
  if (error) return { ok: false, error: dbError(error.message) };
  if (!count) return { ok: false, error: "Só o dono do lead ou um administrador pode excluir." };
  revalidateCrm();
  redirect("/leads");
}

/** Cria (ou reaproveita pelo telefone) um cliente a partir do lead e vincula. */
export async function convertLeadToCustomer(leadId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!uuid.safeParse(leadId).success) return { ok: false, error: "Lead inválido." };
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("id,name,phone,email,customer_id").eq("id", leadId).maybeSingle();
  if (!lead) return { ok: false, error: "Lead não encontrado." };
  if (lead.customer_id) return { ok: true, id: lead.customer_id };

  let customerId: string | null = null;
  if (lead.phone) {
    const { data: existing } = await supabase.from("customers").select("id").eq("phone", lead.phone).limit(1).maybeSingle();
    customerId = existing?.id ?? null;
  }
  if (!customerId) {
    const { data, error } = await supabase
      .from("customers")
      .insert({ team_id: session.teamId, owner_id: session.userId, name: lead.name, phone: lead.phone, email: lead.email })
      .select("id")
      .single();
    if (error) return { ok: false, error: dbError(error.message) };
    customerId = data.id;
  }
  const { error } = await supabase.from("leads").update({ customer_id: customerId }).eq("id", leadId);
  if (error) return { ok: false, error: dbError(error.message) };
  // vincula o histórico já existente do lead ao cliente
  await supabase.from("activities").update({ customer_id: customerId }).eq("lead_id", leadId).is("customer_id", null);
  revalidateCrm(leadId, customerId);
  return { ok: true, id: customerId! };
}

/* ------------------------- TIMELINE / NOTAS ------------------------- */

const CONTACT_TITLES: Record<string, string> = {
  ligacao: "Ligação registrada", whatsapp: "Conversa no WhatsApp", email: "E-mail enviado",
  visita: "Visita na loja", test_drive: "Test-drive realizado", follow_up: "Follow-up",
};

export async function registerContact(_: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  const leadId = formData.get("lead_id") ? uuid.safeParse(formData.get("lead_id")) : null;
  const customerId = formData.get("customer_id") ? uuid.safeParse(formData.get("customer_id")) : null;
  if ((leadId && !leadId.success) || (customerId && !customerId.success) || (!leadId && !customerId)) {
    return { ok: false, error: "Vínculo inválido." };
  }
  const parsed = contactSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({
    team_id: session.teamId,
    owner_id: session.userId,
    lead_id: leadId?.data ?? null,
    customer_id: customerId?.data ?? null,
    type: parsed.data.type,
    title: CONTACT_TITLES[parsed.data.type] ?? "Contato",
    description: parsed.data.description,
    occurred_at: parsed.data.occurred_at ?? new Date().toISOString(),
  });
  if (error) return { ok: false, error: dbError(error.message) };

  // primeiro contato move o lead de "novo" para "primeiro_contato"
  if (leadId?.data) {
    await supabase.from("leads").update({ stage: "primeiro_contato" }).eq("id", leadId.data).eq("stage", "novo");
  }
  revalidateCrm(leadId?.data, customerId?.data);
  return { ok: true };
}

export async function addNote(_: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  const leadId = (formData.get("lead_id") as string) || null;
  const customerId = (formData.get("customer_id") as string) || null;
  if ((leadId && !uuid.safeParse(leadId).success) || (customerId && !uuid.safeParse(customerId).success)) {
    return { ok: false, error: "Vínculo inválido." };
  }
  const parsed = noteSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("notes").insert({
    team_id: session.teamId, owner_id: session.userId, lead_id: leadId, customer_id: customerId, content: parsed.data.content,
  });
  if (error) return { ok: false, error: dbError(error.message) };
  await supabase.from("activities").insert({
    team_id: session.teamId, owner_id: session.userId, lead_id: leadId, customer_id: customerId,
    type: "nota", title: "Nota adicionada", description: parsed.data.content.slice(0, 280),
  });
  revalidateCrm(leadId, customerId);
  return { ok: true };
}

export async function deleteNote(noteId: string): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(noteId).success) return { ok: false, error: "Nota inválida." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("notes").delete({ count: "exact" }).eq("id", noteId);
  if (error || !count) return { ok: false, error: "Só o autor ou um administrador pode excluir a nota." };
  revalidateCrm();
  return { ok: true };
}

/* ------------------------------ TAREFAS ------------------------------ */

export async function createFollowUp(_: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  const leadId = (formData.get("lead_id") as string) || null;
  const customerId = (formData.get("customer_id") as string) || null;
  if ((leadId && !uuid.safeParse(leadId).success) || (customerId && !uuid.safeParse(customerId).success)) {
    return { ok: false, error: "Vínculo inválido." };
  }
  const parsed = z
    .object({
      title: z.string().trim().min(1, "Descreva a tarefa.").max(200),
      due_at: optDateTime,
      priority: z.enum(["baixa", "media", "alta"]).default("media"),
    })
    .safeParse({ title: formData.get("title"), due_at: formData.get("due_at"), priority: formData.get("priority") || undefined });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    team_id: session.teamId, owner_id: session.userId, lead_id: leadId, customer_id: customerId, ...parsed.data,
  });
  if (error) return { ok: false, error: dbError(error.message) };

  // próxima ação do lead acompanha o follow-up mais próximo
  if (leadId && parsed.data.due_at) {
    const { data: lead } = await supabase.from("leads").select("next_action_at").eq("id", leadId).maybeSingle();
    if (!lead?.next_action_at || lead.next_action_at > parsed.data.due_at || lead.next_action_at < new Date().toISOString()) {
      await supabase.from("leads").update({ next_action: parsed.data.title, next_action_at: parsed.data.due_at }).eq("id", leadId);
    }
  }
  revalidateCrm(leadId, customerId);
  revalidatePath("/tarefas");
  return { ok: true };
}

export async function setTaskStatus(taskId: string, status: "pendente" | "concluida" | "cancelada"): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(taskId).success || !["pendente", "concluida", "cancelada"].includes(status)) {
    return { ok: false, error: "Dados inválidos." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").update({ status }).eq("id", taskId).select("lead_id,customer_id").maybeSingle();
  if (error || !data) return { ok: false, error: dbError(error?.message) };
  revalidateCrm(data.lead_id, data.customer_id);
  revalidatePath("/tarefas");
  return { ok: true };
}

/* ------------------------------- TAGS ------------------------------- */

export async function toggleTag(target: "lead" | "customer", targetId: string, tagName: string): Promise<ActionResult> {
  const session = await getSession();
  const name = tagName.trim().slice(0, 40);
  if (!uuid.safeParse(targetId).success || !name) return { ok: false, error: "Dados inválidos." };
  const supabase = await createClient();

  let { data: tag } = await supabase.from("tags").select("id").ilike("name", name).maybeSingle();
  if (!tag) {
    const created = await supabase.from("tags").insert({ team_id: session.teamId, name }).select("id").single();
    if (created.error) return { ok: false, error: dbError(created.error.message) };
    tag = created.data;
  }
  const table = target === "lead" ? "lead_tags" : "customer_tags";
  const col = target === "lead" ? "lead_id" : "customer_id";
  const { data: existing } = await supabase.from(table).select("tag_id").eq(col, targetId).eq("tag_id", tag.id).maybeSingle();
  const { error } = existing
    ? await supabase.from(table).delete().eq(col, targetId).eq("tag_id", tag.id)
    : await supabase.from(table).insert({ team_id: session.teamId, [col]: targetId, tag_id: tag.id });
  if (error) return { ok: false, error: dbError(error.message) };
  revalidateCrm(target === "lead" ? targetId : null, target === "customer" ? targetId : null);
  return { ok: true };
}

/* ----------------------------- CLIENTES ----------------------------- */

export async function createCustomer(_: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  const parsed = customerSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...parsed.data, team_id: session.teamId, owner_id: session.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: dbError(error.message) };
  revalidateCrm(null, data.id);
  redirect(`/clientes/${data.id}`);
}

export async function updateCustomer(_: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await getSession();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Cliente inválido." };
  const parsed = customerSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error, count } = await supabase.from("customers").update(parsed.data, { count: "exact" }).eq("id", id.data);
  if (error || !count) return { ok: false, error: dbError(error?.message) };
  revalidateCrm(null, id.data);
  return { ok: true, id: id.data };
}

export async function deleteCustomer(customerId: string): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(customerId).success) return { ok: false, error: "Cliente inválido." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("customers").delete({ count: "exact" }).eq("id", customerId);
  if (error) return { ok: false, error: dbError(error.message) };
  if (!count) return { ok: false, error: "Só o dono do cadastro ou um administrador pode excluir." };
  revalidateCrm();
  redirect("/clientes");
}
