"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { formValues } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { money, optText } from "@/features/crm/schemas";

export type ActionResult = { ok: boolean; error?: string; id?: string };
const uuid = z.string().uuid();

const proposalSchema = z.object({
  lead_id: z.string().uuid("Escolha o lead."),
  vehicle_id: z.string().uuid("Escolha o veículo."),
  vehicle_price: money,
  discount: money,
  down_payment: money,
  trade_in_description: optText(200),
  trade_in_value: money,
  financed_amount: money,
  installments: z.union([z.string(), z.null()]).transform((v) => (v ? Math.max(1, Math.min(120, parseInt(v, 10) || 0)) || null : null)),
  installment_value: money,
  valid_until: z.union([z.string(), z.null()]).transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
  notes: optText(2000),
});

function revalidateAll(leadId?: string | null, customerId?: string | null, vehicleId?: string | null) {
  ["/propostas", "/leads", "/", "/painel", "/estoque"].forEach((p) => revalidatePath(p));
  if (leadId) revalidatePath(`/leads/${leadId}`);
  if (customerId) revalidatePath(`/clientes/${customerId}`);
  if (vehicleId) revalidatePath(`/estoque/${vehicleId}`);
}

export async function saveProposal(_: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const session = await getSession();
  const parsed = proposalSchema.safeParse(formValues(fd, proposalSchema));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const supabase = await createClient();
  const [{ data: lead }, { data: vehicle }] = await Promise.all([
    supabase.from("leads").select("id,customer_id,stage").eq("id", d.lead_id).maybeSingle(),
    supabase.from("vehicles").select("id,sale_price").eq("id", d.vehicle_id).maybeSingle(),
  ]);
  if (!lead || !vehicle) return { ok: false, error: "Lead ou veículo não encontrado." };
  const row = {
    ...d,
    vehicle_price: d.vehicle_price ?? vehicle.sale_price,
    discount: d.discount ?? 0, down_payment: d.down_payment ?? 0, trade_in_value: d.trade_in_value ?? 0, financed_amount: d.financed_amount ?? 0,
    customer_id: lead.customer_id,
  };
  const id = fd.get("id");
  if (id) {
    if (!uuid.safeParse(id).success) return { ok: false, error: "Proposta inválida." };
    const { error, count } = await supabase.from("proposals").update(row, { count: "exact" }).eq("id", String(id));
    if (error || !count) return { ok: false, error: "Não foi possível salvar." };
    revalidateAll(d.lead_id, lead.customer_id, d.vehicle_id);
    return { ok: true, id: String(id) };
  }
  const { data, error } = await supabase.from("proposals").insert({ ...row, team_id: session.teamId, owner_id: session.userId, status: "rascunho" }).select("id").single();
  if (error) return { ok: false, error: "Não foi possível criar a proposta." };
  await supabase.from("leads").update({ stage: "proposta", vehicle_id: d.vehicle_id }).eq("id", d.lead_id)
    .in("stage", ["novo", "primeiro_contato", "atendimento", "qualificado", "visita", "sem_resposta"]);
  revalidateAll(d.lead_id, lead.customer_id, d.vehicle_id);
  redirect(`/propostas/${data.id}`);
}

export async function setProposalStatus(id: string, status: "rascunho" | "enviada" | "recusada" | "expirada"): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(id).success || !["rascunho", "enviada", "recusada", "expirada"].includes(status)) return { ok: false, error: "Dados inválidos." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("proposals").update({ status }).eq("id", id).select("lead_id,customer_id,vehicle_id").maybeSingle();
  if (error || !data) return { ok: false, error: "Não foi possível alterar." };
  if (status === "enviada" && data.lead_id) {
    await supabase.from("leads").update({ stage: "negociacao" }).eq("id", data.lead_id).in("stage", ["proposta", "visita", "qualificado"]);
  }
  revalidateAll(data.lead_id, data.customer_id, data.vehicle_id);
  return { ok: true };
}

/**
 * Alto risco (UI exige confirmação): proposta aceita → lead vira VENDA com o valor fechado
 * e o veículo vira VENDIDO vinculado ao lead. Tudo fica na timeline (triggers).
 */
export async function acceptProposalAndRegisterSale(id: string): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Proposta inválida." };
  const supabase = await createClient();
  const { data: p } = await supabase.from("proposals").select("id,lead_id,customer_id,vehicle_id,total,status").eq("id", id).maybeSingle();
  if (!p) return { ok: false, error: "Proposta não encontrada." };
  if (!p.lead_id || !p.vehicle_id) return { ok: false, error: "A proposta precisa de lead e veículo." };
  const { data: v } = await supabase.from("vehicles").select("status,sold_lead_id").eq("id", p.vehicle_id).maybeSingle();
  if (v?.status === "vendido" && v.sold_lead_id !== p.lead_id) return { ok: false, error: "Este veículo já foi vendido para outro cliente." };

  const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const r1 = await supabase.from("proposals").update({ status: "aceita" }).eq("id", id);
  const r2 = await supabase.from("leads").update({ stage: "venda", closed_value: p.total }).eq("id", p.lead_id);
  const r3 = await supabase.from("vehicles").update({ status: "vendido", sold_lead_id: p.lead_id, sold_price: p.total, sold_at: today }).eq("id", p.vehicle_id);
  if (r1.error || r2.error || r3.error) return { ok: false, error: "A venda foi registrada parcialmente. Confira o lead e o veículo." };
  // outras propostas abertas do mesmo veículo expiram
  await supabase.from("proposals").update({ status: "expirada" }).eq("vehicle_id", p.vehicle_id).neq("id", id).in("status", ["rascunho", "enviada"]);
  revalidateAll(p.lead_id, p.customer_id, p.vehicle_id);
  return { ok: true };
}

export async function deleteProposal(id: string): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Proposta inválida." };
  const supabase = await createClient();
  const { data } = await supabase.from("proposals").select("lead_id,status").eq("id", id).maybeSingle();
  if (data?.status === "aceita") return { ok: false, error: "Proposta aceita (venda registrada) não pode ser excluída." };
  const { error, count } = await supabase.from("proposals").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return { ok: false, error: "Só quem criou ou um administrador pode excluir." };
  revalidateAll(data?.lead_id);
  redirect("/propostas");
}
