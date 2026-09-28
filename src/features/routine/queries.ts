import "server-only";

import { createClient } from "@/lib/supabase/server";
import { dayRangeSP, todaySP } from "@/lib/dates";
import { OPEN_STAGES } from "@/features/crm/constants";
import type { Lead } from "@/types/db";

export type TaskRow = {
  id: string; title: string; description: string | null; due_at: string | null; status: string; priority: string;
  lead_id: string | null; customer_id: string | null; vehicle_id: string | null; completed_at: string | null;
  leads?: { name: string } | null; customers?: { name: string } | null;
};

export type AppointmentRow = {
  id: string; title: string; type: string; starts_at: string; ends_at: string | null; location: string | null;
  status: string; notes: string | null; lead_id: string | null; customer_id: string | null; vehicle_id: string | null;
  leads?: { name: string; phone: string | null } | null; customers?: { name: string } | null;
  vehicles?: { brand: string; model: string; year_model: number | null } | null;
};

const TASK_SELECT = "id,title,description,due_at,status,priority,lead_id,customer_id,vehicle_id,completed_at,leads(name),customers(name)";
const APPT_SELECT = "id,title,type,starts_at,ends_at,location,status,notes,lead_id,customer_id,vehicle_id,leads(name,phone),customers(name),vehicles(brand,model,year_model)";

export async function listTasks(view: "atrasadas" | "hoje" | "futuras" | "sem_data" | "concluidas") {
  const supabase = await createClient();
  const { start, end } = dayRangeSP(todaySP());
  const now = new Date().toISOString();
  let q = supabase.from("tasks").select(TASK_SELECT);
  switch (view) {
    case "atrasadas": q = q.eq("status", "pendente").lt("due_at", now).order("due_at"); break;
    case "hoje": q = q.eq("status", "pendente").gte("due_at", now).lt("due_at", end).order("due_at"); break;
    case "futuras": q = q.eq("status", "pendente").gte("due_at", end).order("due_at"); break;
    case "sem_data": q = q.eq("status", "pendente").is("due_at", null).order("created_at", { ascending: false }); break;
    case "concluidas": q = q.eq("status", "concluida").gte("completed_at", new Date(Date.parse(start) - 30 * 86400000).toISOString()).order("completed_at", { ascending: false }); break;
  }
  const { data, error } = await q.limit(300);
  return { tasks: (data ?? []) as unknown as TaskRow[], error: error?.message ?? null };
}

export async function taskCounts() {
  const supabase = await createClient();
  const { end } = dayRangeSP(todaySP());
  const now = new Date().toISOString();
  const [late, today, future, nodate] = await Promise.all([
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "pendente").lt("due_at", now),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "pendente").gte("due_at", now).lt("due_at", end),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "pendente").gte("due_at", end),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "pendente").is("due_at", null),
  ]);
  return { atrasadas: late.count ?? 0, hoje: today.count ?? 0, futuras: future.count ?? 0, sem_data: nodate.count ?? 0 };
}

export async function listAppointments(fromIso: string, toIso: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("appointments").select(APPT_SELECT)
    .gte("starts_at", fromIso).lt("starts_at", toIso).order("starts_at").limit(500);
  return { appointments: (data ?? []) as unknown as AppointmentRow[], error: error?.message ?? null };
}

export type CallItem = { lead: Lead; reason: string; score: number };

/**
 * "Quem eu preciso chamar hoje?" — prioriza leads em aberto por regras explícitas.
 * Usada pela tela Meu Dia e pela ferramenta da IA (who_to_call_today).
 */
export async function getCallList(limit = 20): Promise<CallItem[]> {
  const supabase = await createClient();
  const { end } = dayRangeSP(todaySP());
  const now = Date.now();
  const { data } = await supabase.from("leads").select("*").in("stage", OPEN_STAGES).limit(1000);
  const items: CallItem[] = [];
  for (const lead of (data ?? []) as Lead[]) {
    const reasons: string[] = [];
    let score = 0;
    const next = lead.next_action_at ? Date.parse(lead.next_action_at) : null;
    const last = lead.last_contact_at ? Date.parse(lead.last_contact_at) : null;
    const daysSince = last ? Math.floor((now - last) / 86400000) : null;

    if (next && next < now) { score += 50 + Math.min(30, Math.floor((now - next) / 86400000) * 5); reasons.push("follow-up atrasado"); }
    else if (next && next < Date.parse(end)) { score += 40; reasons.push("próxima ação é hoje"); }
    if (lead.temperature === "quente") { score += 25; reasons.push("lead quente"); }
    else if (lead.temperature === "morno") score += 10;
    if (["proposta", "negociacao"].includes(lead.stage)) { score += 20; reasons.push("perto de fechar"); }
    if (lead.stage === "novo" && !last) {
      const age = (now - Date.parse(lead.created_at)) / 3600000;
      score += age > 2 ? 35 : 20; reasons.push("lead novo sem contato");
    }
    if (daysSince !== null && daysSince >= 3 && !next) { score += Math.min(25, daysSince * 3); reasons.push(`${daysSince} dias sem contato`); }
    if (!next && !["novo"].includes(lead.stage) && daysSince === null) { score += 10; reasons.push("sem próxima ação definida"); }

    if (score >= 20) items.push({ lead, reason: reasons.join(" · "), score });
  }
  return items.sort((a, b) => b.score - a.score).slice(0, limit);
}
