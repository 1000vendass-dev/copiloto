"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { optDateTime, optText, optUuid } from "@/features/crm/schemas";
import { formValues } from "@/lib/forms";

export type ActionResult = { ok: boolean; error?: string; id?: string };
const uuid = z.string().uuid();

function revalidateRoutine(leadId?: string | null, customerId?: string | null) {
  ["/", "/tarefas", "/agenda"].forEach((p) => revalidatePath(p));
  if (leadId) revalidatePath(`/leads/${leadId}`);
  if (customerId) revalidatePath(`/clientes/${customerId}`);
}
const friendly = (m?: string) => (m && /row-level security/i.test(m) ? "Você não tem permissão para esta ação." : "Não foi possível salvar. Tente novamente.");

/* ------------------------------ TAREFAS ------------------------------ */
const taskSchema = z.object({
  title: z.string().trim().min(1, "Descreva a tarefa.").max(200),
  description: optText(2000),
  due_at: optDateTime,
  priority: z.enum(["baixa", "media", "alta"]).default("media"),
  lead_id: optUuid,
});

export async function saveTask(_: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const session = await getSession();
  const parsed = taskSchema.safeParse(formValues(fd, taskSchema));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const id = fd.get("id");

  let customerId: string | null = null;
  if (parsed.data.lead_id) {
    const { data } = await supabase.from("leads").select("customer_id").eq("id", parsed.data.lead_id).maybeSingle();
    customerId = data?.customer_id ?? null;
  }
  if (id) {
    if (!uuid.safeParse(id).success) return { ok: false, error: "Tarefa inválida." };
    const { error, count } = await supabase.from("tasks").update({ ...parsed.data, customer_id: customerId }, { count: "exact" }).eq("id", String(id));
    if (error || !count) return { ok: false, error: friendly(error?.message) };
  } else {
    const { error } = await supabase.from("tasks").insert({ ...parsed.data, customer_id: customerId, team_id: session.teamId, owner_id: session.userId });
    if (error) return { ok: false, error: friendly(error.message) };
  }
  revalidateRoutine(parsed.data.lead_id, customerId);
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(taskId).success) return { ok: false, error: "Tarefa inválida." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("tasks").delete({ count: "exact" }).eq("id", taskId);
  if (error || !count) return { ok: false, error: "Só quem criou ou um administrador pode excluir." };
  revalidateRoutine();
  return { ok: true };
}

/* ---------------------------- COMPROMISSOS ---------------------------- */
const apptSchema = z.object({
  title: z.string().trim().min(1, "Dê um título ao compromisso.").max(200),
  type: z.enum(["visita", "test_drive", "ligacao", "reuniao", "entrega", "outro"]).default("visita"),
  starts_at: optDateTime.refine((v) => v !== null, "Informe data e hora."),
  ends_at: optDateTime,
  location: optText(200),
  notes: optText(2000),
  lead_id: optUuid,
  vehicle_id: optUuid,
});

export async function saveAppointment(_: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const session = await getSession();
  const parsed = apptSchema.safeParse(formValues(fd, apptSchema));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  if (parsed.data.ends_at && parsed.data.starts_at && parsed.data.ends_at < parsed.data.starts_at) {
    return { ok: false, error: "O término precisa ser depois do início." };
  }
  const supabase = await createClient();
  let customerId: string | null = null;
  if (parsed.data.lead_id) {
    const { data } = await supabase.from("leads").select("customer_id").eq("id", parsed.data.lead_id).maybeSingle();
    customerId = data?.customer_id ?? null;
  }
  const row = { ...parsed.data, customer_id: customerId };
  const id = fd.get("id");
  if (id) {
    if (!uuid.safeParse(id).success) return { ok: false, error: "Compromisso inválido." };
    const { error, count } = await supabase.from("appointments").update(row, { count: "exact" }).eq("id", String(id));
    if (error || !count) return { ok: false, error: friendly(error?.message) };
  } else {
    const { error } = await supabase.from("appointments").insert({ ...row, team_id: session.teamId, owner_id: session.userId });
    if (error) return { ok: false, error: friendly(error.message) };
    // visita agendada avança o lead no funil (sem retroceder)
    if (parsed.data.lead_id && ["visita", "test_drive"].includes(parsed.data.type)) {
      await supabase.from("leads").update({ stage: "visita" }).eq("id", parsed.data.lead_id)
        .in("stage", ["novo", "primeiro_contato", "atendimento", "qualificado", "sem_resposta"]);
    }
  }
  revalidateRoutine(parsed.data.lead_id, customerId);
  return { ok: true };
}

const APPT_STATUS = ["agendado", "confirmado", "realizado", "cancelado", "nao_compareceu"] as const;
export async function setAppointmentStatus(id: string, status: string): Promise<ActionResult> {
  const session = await getSession();
  if (!uuid.safeParse(id).success || !(APPT_STATUS as readonly string[]).includes(status)) return { ok: false, error: "Dados inválidos." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("appointments").update({ status }).eq("id", id).select("lead_id,customer_id,vehicle_id,type,title").maybeSingle();
  if (error || !data) return { ok: false, error: friendly(error?.message) };
  if (data.lead_id || data.customer_id) {
    const label = { realizado: "realizado(a)", cancelado: "cancelado(a)", nao_compareceu: "— cliente não compareceu", confirmado: "confirmado(a)", agendado: "reagendado(a)" }[status as (typeof APPT_STATUS)[number]];
    await supabase.from("activities").insert({
      team_id: session.teamId, owner_id: session.userId, lead_id: data.lead_id, customer_id: data.customer_id, vehicle_id: data.vehicle_id,
      type: status === "realizado" && ["visita", "test_drive"].includes(data.type) ? data.type : "sistema",
      title: `${data.title} ${label}`,
    });
  }
  revalidateRoutine(data.lead_id, data.customer_id);
  return { ok: true };
}

export async function deleteAppointment(id: string): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Compromisso inválido." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("appointments").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return { ok: false, error: "Só quem criou ou um administrador pode excluir." };
  revalidateRoutine();
  return { ok: true };
}
