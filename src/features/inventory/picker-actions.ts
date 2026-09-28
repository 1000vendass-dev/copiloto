"use server";

import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/features/crm/queries";
import { parseVehicleQuery } from "./parse-query";

export type VehicleOption = { id: string; label: string; price: number | null; status: string };

/** Busca rápida para vincular veículo a lead/proposta (máx. 10). */
export async function searchVehicleOptions(q: string): Promise<VehicleOption[]> {
  await getSession();
  if (q.trim().length < 2) return [];
  const parsed = parseVehicleQuery(q); // entende ano, preço, câmbio ("onix 2023", "V097")
  const supabase = await createClient();
  let query = supabase
    .from("vehicles")
    .select("id,stock_code,brand,model,version,year_model,sale_price,status")
    .neq("status", "inativo")
    .order("status")
    .limit(10);
  for (const term of parsed.terms.map((t) => sanitizeSearch(t).toLowerCase()).filter(Boolean).slice(0, 4)) {
    query = query.ilike("search_text", `%${term}%`);
  }
  if (parsed.yearMin) query = query.gte("year_model", parsed.yearMin);
  if (parsed.yearMax) query = query.lte("year_model", parsed.yearMax);
  if (parsed.priceMax) query = query.lte("sale_price", parsed.priceMax);
  if (parsed.transmission === "automatico") query = query.in("transmission", ["automatico", "automatizado", "cvt"]);
  const { data } = await query;
  return (data ?? []).map((v) => ({
    id: v.id,
    label: `${v.stock_code ? v.stock_code + " · " : ""}${v.brand} ${v.model} ${v.version ?? ""} ${v.year_model ?? ""}`.replace(/\s+/g, " ").trim(),
    price: v.sale_price,
    status: v.status,
  }));
}
