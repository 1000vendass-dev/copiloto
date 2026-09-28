import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Vehicle, VehicleImage } from "@/types/db";
import { sanitizeSearch } from "@/features/crm/queries";
import { IMAGE_BUCKET } from "./constants";
import { parseVehicleQuery, type VehicleQuery } from "./parse-query";

export type InventoryFilters = {
  q?: string; status?: string; body?: string; transmission?: string; store?: string;
  pmin?: string; pmax?: string; ymin?: string; ymax?: string; sort?: string;
};

const toNum = (v?: string) => {
  if (!v) return undefined;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Combina busca livre interpretada + filtros explícitos (explícito vence). */
export function buildQuery(f: InventoryFilters): VehicleQuery {
  const parsed = parseVehicleQuery(f.q ?? "");
  return {
    ...parsed,
    terms: parsed.terms.map((t) => sanitizeSearch(t).toLowerCase()).filter(Boolean),
    bodyType: f.body || parsed.bodyType,
    transmission: (f.transmission as VehicleQuery["transmission"]) || parsed.transmission,
    priceMin: toNum(f.pmin) ?? parsed.priceMin,
    priceMax: toNum(f.pmax) ?? parsed.priceMax,
    yearMin: toNum(f.ymin) ?? parsed.yearMin,
    yearMax: toNum(f.ymax) ?? parsed.yearMax,
  };
}

/** Busca estrutural no banco. Também usada pela IA (ferramenta search_vehicles). */
export async function searchVehicles(q: VehicleQuery, opts: { status?: string; store?: string; sort?: string; limit?: number } = {}) {
  const supabase = await createClient();
  let query = supabase.from("vehicles").select("*", { count: "exact" });

  const status = opts.status ?? "disponivel";
  if (status !== "todos") query = query.eq("status", status);
  if (opts.store) query = query.eq("store", opts.store);
  for (const term of q.terms.slice(0, 5)) query = query.ilike("search_text", `%${term}%`);
  if (q.bodyType) query = query.eq("body_type", q.bodyType);
  if (q.transmission === "automatico") query = query.in("transmission", ["automatico", "automatizado", "cvt"]);
  else if (q.transmission) query = query.eq("transmission", q.transmission);
  if (q.fuel) query = query.eq("fuel", q.fuel);
  if (q.category) query = query.eq("category", q.category);
  if (q.priceMin) query = query.gte("sale_price", q.priceMin);
  if (q.priceMax) query = query.lte("sale_price", q.priceMax);
  if (q.yearMin) query = query.gte("year_model", q.yearMin);
  if (q.yearMax) query = query.lte("year_model", q.yearMax);
  if (q.kmMax) query = query.lte("km", q.kmMax);

  switch (opts.sort) {
    case "preco_asc": query = query.order("sale_price", { ascending: true, nullsFirst: false }); break;
    case "preco_desc": query = query.order("sale_price", { ascending: false, nullsFirst: false }); break;
    case "ano_desc": query = query.order("year_model", { ascending: false, nullsFirst: false }); break;
    case "km_asc": query = query.order("km", { ascending: true, nullsFirst: false }); break;
    default: query = query.order("entry_date", { ascending: false }).order("stock_code", { ascending: true });
  }
  const { data, count, error } = await query.limit(opts.limit ?? 300);
  return { vehicles: (data ?? []) as Vehicle[], count: count ?? 0, error: error?.message ?? null };
}

/** Mapa vehicle_id → URL assinada da foto principal (1h). */
export async function primaryImageUrls(vehicleIds: string[]) {
  if (!vehicleIds.length) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicle_images")
    .select("vehicle_id,storage_path,is_primary,position")
    .in("vehicle_id", vehicleIds)
    .order("is_primary", { ascending: false })
    .order("position");
  const first = new Map<string, string>();
  (data ?? []).forEach((r) => { if (!first.has(r.vehicle_id)) first.set(r.vehicle_id, r.storage_path); });
  if (!first.size) return new Map<string, string>();
  const paths = [...first.values()];
  // fotos já são comprimidas no upload (máx. 1600px); transformação de imagem não é usada (exige plano pago)
  const { data: signed } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(paths, 3600);
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const out = new Map<string, string>();
  first.forEach((path, vid) => { const u = byPath.get(path); if (u) out.set(vid, u); });
  return out;
}

export async function getVehicle(id: string) {
  const supabase = await createClient();
  const { data: vehicle } = await supabase.from("vehicles").select("*").eq("id", id).maybeSingle();
  if (!vehicle) return null;
  const [images, features, leads] = await Promise.all([
    supabase.from("vehicle_images").select("*").eq("vehicle_id", id).order("is_primary", { ascending: false }).order("position"),
    supabase.from("vehicle_features").select("name").eq("vehicle_id", id).order("name"),
    supabase.from("leads").select("id,name,stage,temperature,phone").eq("vehicle_id", id).order("updated_at", { ascending: false }),
  ]);
  const imgs = (images.data ?? []) as VehicleImage[];
  if (imgs.length) {
    const { data: signed } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(imgs.map((i) => i.storage_path), 3600);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    imgs.forEach((i) => (i.url = byPath.get(i.storage_path) ?? undefined));
  }
  return {
    vehicle: vehicle as Vehicle,
    images: imgs,
    features: (features.data ?? []).map((f) => f.name as string),
    leads: leads.data ?? [],
  };
}

export async function listStores() {
  const supabase = await createClient();
  const { data } = await supabase.from("vehicles").select("store").not("store", "is", null).limit(2000);
  return [...new Set((data ?? []).map((r) => r.store as string))].sort();
}
