"use server";

import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/features/crm/queries";

export type VehicleOption = { id: string; label: string; price: number | null; status: string };

/** Busca rápida para vincular veículo a lead/proposta (máx. 10). */
export async function searchVehicleOptions(q: string): Promise<VehicleOption[]> {
  await getSession();
  const s = sanitizeSearch(q).toLowerCase();
  if (s.length < 2) return [];
  const supabase = await createClient();
  let query = supabase
    .from("vehicles")
    .select("id,stock_code,brand,model,version,year_model,sale_price,status")
    .neq("status", "inativo")
    .order("status")
    .limit(10);
  for (const term of s.split(" ").slice(0, 4)) query = query.ilike("search_text", `%${term}%`);
  const { data } = await query;
  return (data ?? []).map((v) => ({
    id: v.id,
    label: `${v.stock_code ? v.stock_code + " · " : ""}${v.brand} ${v.model} ${v.version ?? ""} ${v.year_model ?? ""}`.replace(/\s+/g, " ").trim(),
    price: v.sale_price,
    status: v.status,
  }));
}
