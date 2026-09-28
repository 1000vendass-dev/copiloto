import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Activity, Customer, Lead, Note, Tag, Task } from "@/types/db";
import { OPEN_STAGES, STAGE_VALUES, type Stage } from "./constants";

export type LeadFilters = { q?: string; stage?: string; temperature?: string; view?: string };

/** Remove curingas do ILIKE e caracteres reservados do filtro .or() do PostgREST. */
export function sanitizeSearch(q: string) {
  return q.replace(/[%_\\,()"'*:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function listLeads(filters: LeadFilters) {
  const supabase = await createClient();
  let query = supabase
    .from("leads")
    .select("*")
    .order("next_action_at", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (filters.stage && (STAGE_VALUES as string[]).includes(filters.stage)) {
    query = query.eq("stage", filters.stage);
  } else if (filters.stage !== "todos" && filters.view !== "funil") {
    query = query.in("stage", OPEN_STAGES); // padrão: só leads em aberto
  }
  if (filters.temperature) query = query.eq("temperature", filters.temperature);
  if (filters.q) {
    const s = sanitizeSearch(filters.q);
    if (s) query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,interest.ilike.%${s}%,email.ilike.%${s}%`);
  }
  const { data, error } = await query;
  return { leads: (data ?? []) as Lead[], error: error?.message ?? null };
}

export async function getLead(id: string) {
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) return null;

  const [activities, notes, tasks, tagsAll, leadTags, customer, vehicle] = await Promise.all([
    supabase.from("activities").select("id,type,title,description,occurred_at,lead_id,customer_id,metadata")
      .eq("lead_id", id).order("occurred_at", { ascending: false }).limit(200),
    supabase.from("notes").select("id,content,created_at,owner_id").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").eq("lead_id", id).order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("tags").select("id,name,color").order("name"),
    supabase.from("lead_tags").select("tag_id").eq("lead_id", id),
    lead.customer_id ? supabase.from("customers").select("id,name,phone").eq("id", lead.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    lead.vehicle_id ? supabase.from("vehicles").select("id,brand,model,version,year_model,sale_price,status,stock_code").eq("id", lead.vehicle_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const tagIds = new Set((leadTags.data ?? []).map((t) => t.tag_id));
  return {
    lead: lead as Lead,
    activities: (activities.data ?? []) as Activity[],
    notes: (notes.data ?? []) as Note[],
    tasks: (tasks.data ?? []) as Task[],
    allTags: (tagsAll.data ?? []) as Tag[],
    tags: ((tagsAll.data ?? []) as Tag[]).filter((t) => tagIds.has(t.id)),
    customer: customer.data as { id: string; name: string; phone: string | null } | null,
    vehicle: vehicle.data as VehicleRef | null,
  };
}

export type VehicleRef = {
  id: string; brand: string; model: string; version: string | null; year_model: number | null;
  sale_price: number | null; status: string; stock_code: string | null;
};

export async function listCustomers(q?: string) {
  const supabase = await createClient();
  let query = supabase.from("customers").select("*").order("name").limit(500);
  if (q) {
    const s = sanitizeSearch(q);
    if (s) query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,city.ilike.%${s}%`);
  }
  const { data, error } = await query;
  return { customers: (data ?? []) as Customer[], error: error?.message ?? null };
}

export async function getCustomer(id: string) {
  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!customer) return null;
  const [leads, activities, notes, tasks, appointments, proposals, tagsAll, custTags] = await Promise.all([
    supabase.from("leads").select("*").eq("customer_id", id).order("updated_at", { ascending: false }),
    supabase.from("activities").select("id,type,title,description,occurred_at,lead_id,customer_id,metadata")
      .eq("customer_id", id).order("occurred_at", { ascending: false }).limit(200),
    supabase.from("notes").select("id,content,created_at,owner_id").eq("customer_id", id).order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").eq("customer_id", id).order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("appointments").select("id,title,type,starts_at,status").eq("customer_id", id).order("starts_at", { ascending: false }),
    supabase.from("proposals").select("id,status,total,created_at,vehicle_id").eq("customer_id", id).order("created_at", { ascending: false }),
    supabase.from("tags").select("id,name,color").order("name"),
    supabase.from("customer_tags").select("tag_id").eq("customer_id", id),
  ]);

  // timeline do cliente = atividades do cliente + atividades dos leads dele
  const leadIds = (leads.data ?? []).map((l) => l.id);
  let leadActivities: Activity[] = [];
  if (leadIds.length) {
    const { data } = await supabase.from("activities").select("id,type,title,description,occurred_at,lead_id,customer_id,metadata")
      .in("lead_id", leadIds).order("occurred_at", { ascending: false }).limit(300);
    leadActivities = (data ?? []) as Activity[];
  }
  const merged = new Map<string, Activity>();
  [...((activities.data ?? []) as Activity[]), ...leadActivities].forEach((a) => merged.set(a.id, a));
  const timeline = [...merged.values()].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  const tagIds = new Set((custTags.data ?? []).map((t) => t.tag_id));
  return {
    customer: customer as Customer,
    leads: (leads.data ?? []) as Lead[],
    timeline,
    notes: (notes.data ?? []) as Note[],
    tasks: (tasks.data ?? []) as Task[],
    appointments: appointments.data ?? [],
    proposals: proposals.data ?? [],
    allTags: (tagsAll.data ?? []) as Tag[],
    tags: ((tagsAll.data ?? []) as Tag[]).filter((t) => tagIds.has(t.id)),
  };
}

export async function stageCounts() {
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("stage");
  const counts: Partial<Record<Stage, number>> = {};
  (data ?? []).forEach((r) => (counts[r.stage as Stage] = (counts[r.stage as Stage] ?? 0) + 1));
  return counts;
}
