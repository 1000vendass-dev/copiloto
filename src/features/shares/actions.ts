"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ShareResult = { ok: boolean; error?: string; url?: string; phone?: string | null; leadName?: string | null; text?: string };

const schema = z.object({
  vehicleId: z.string().uuid(),
  leadId: z.string().uuid().nullable(),
  price: z.number().min(0).max(100_000_000).nullable(),
  showPrice: z.boolean(),
  message: z.string().trim().max(1000).nullable(),
  days: z.number().int().min(1).max(90),
});

export async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Cria o link da ficha para o cliente, com preço personalizado. */
export async function createShare(input: z.input<typeof schema>): Promise<ShareResult> {
  const session = await getSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const d = parsed.data;
  const supabase = await createClient();
  const { data: v } = await supabase.from("vehicles").select("id,brand,model,version,year_model,sale_price,status").eq("id", d.vehicleId).maybeSingle();
  if (!v) return { ok: false, error: "Veículo não encontrado." };
  if (v.status === "vendido") return { ok: false, error: "Este veículo já foi vendido." };

  let lead: { name: string; phone: string | null } | null = null;
  if (d.leadId) {
    const { data } = await supabase.from("leads").select("name,phone").eq("id", d.leadId).maybeSingle();
    lead = data;
  }
  const { data: share, error } = await supabase.from("vehicle_shares").insert({
    team_id: session.teamId, owner_id: session.userId, vehicle_id: v.id, lead_id: d.leadId,
    price: d.price ?? v.sale_price, base_price: v.sale_price, show_price: d.showPrice, message: d.message || null,
    expires_at: new Date(Date.now() + d.days * 86400000).toISOString(),
  }).select("token").single();
  if (error) return { ok: false, error: "Não foi possível criar o link." };

  // vincula o veículo ao lead se ele ainda não tiver um de interesse
  if (d.leadId) await supabase.from("leads").update({ vehicle_id: v.id }).eq("id", d.leadId).is("vehicle_id", null);

  const url = `${await siteOrigin()}/v/${share.token}`;
  const nome = lead?.name ? lead.name.split(" ")[0] : "";
  const preco = d.showPrice && (d.price ?? v.sale_price) ? ` por ${brl(Number(d.price ?? v.sale_price))}` : "";
  const text = `${nome ? `Olá, ${nome}! ` : "Olá! "}Separei as fotos e a ficha completa do ${v.brand} ${v.model} ${v.year_model ?? ""}${preco} para você: ${url}`.replace(/\s+/g, " ");
  revalidatePath(`/estoque/${v.id}`);
  if (d.leadId) revalidatePath(`/leads/${d.leadId}`);
  return { ok: true, url, phone: lead?.phone ?? null, leadName: lead?.name ?? null, text };
}

export async function revokeShare(id: string): Promise<{ ok: boolean; error?: string }> {
  await getSession();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Link inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("vehicle_shares").update({ revoked: true }).eq("id", id).select("vehicle_id").maybeSingle();
  if (error || !data) return { ok: false, error: "Não foi possível desativar." };
  revalidatePath(`/estoque/${data.vehicle_id}`);
  return { ok: true };
}
