"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { guessBodyType } from "./normalize";
import { createClient } from "@/lib/supabase/server";

const rowSchema = z.object({
  stock_code: z.string().max(20).nullable(), brand: z.string().min(1).max(60), model: z.string().min(1).max(80),
  version: z.string().max(120).nullable(), year_manufacture: z.number().int().min(1900).max(2100).nullable(),
  year_model: z.number().int().min(1900).max(2100).nullable(), km: z.number().int().min(0).max(3_000_000).nullable(),
  color: z.string().max(40).nullable(), fuel: z.string().max(30).nullable(), transmission: z.string().max(30).nullable(),
  plate: z.string().max(10).nullable(), sale_price: z.number().min(0).nullable(), purchase_price: z.number().min(0).nullable(),
  store: z.string().max(60).nullable(), description: z.string().max(4000).nullable(), features: z.array(z.string().max(80)).max(60),
});
const payloadSchema = z.array(z.object({ line: z.number().int(), data: rowSchema })).max(3000);
export type ImportData = z.infer<typeof rowSchema>;

export type PreviewItem = { line: number; action: "novo" | "atualizar" | "duplicado"; matchId?: string; changes?: string[] };

const COMPARE: (keyof ImportData)[] = ["sale_price", "km", "version", "color", "store", "year_model", "transmission", "fuel"];

async function existingIndex(teamId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("vehicles").select("id,stock_code,plate,sale_price,km,version,color,store,year_model,transmission,fuel").eq("team_id", teamId).limit(10000);
  const byCode = new Map<string, Record<string, unknown>>();
  const byPlate = new Map<string, Record<string, unknown>>();
  (data ?? []).forEach((v) => {
    if (v.stock_code) byCode.set(String(v.stock_code).toUpperCase(), v);
    if (v.plate) byPlate.set(String(v.plate).toUpperCase(), v);
  });
  return { byCode, byPlate };
}

/** Classifica cada linha: novo, atualização (com o que muda) ou duplicado sem mudança. Não grava nada. */
export async function previewImport(rows: unknown): Promise<{ ok: boolean; error?: string; items?: PreviewItem[] }> {
  const session = await getSession();
  const parsed = payloadSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Dados da planilha inválidos." };
  const { byCode, byPlate } = await existingIndex(session.teamId);
  const seen = new Set<string>();
  const items: PreviewItem[] = parsed.data.map(({ line, data }) => {
    const key = (data.stock_code ?? data.plate ?? "").toUpperCase();
    const match = (data.stock_code && byCode.get(data.stock_code.toUpperCase())) || (data.plate && byPlate.get(data.plate.toUpperCase())) || null;
    if (key && seen.has(key)) return { line, action: "duplicado" };
    if (key) seen.add(key);
    if (!match) return { line, action: "novo" };
    const changes = COMPARE.filter((k) => data[k] !== null && data[k] !== undefined && String(data[k]) !== String(match[k] ?? "")).map(String);
    return changes.length ? { line, action: "atualizar", matchId: String(match.id), changes } : { line, action: "duplicado", matchId: String(match.id) };
  });
  return { ok: true, items };
}

/** Importa: cria os novos; atualiza existentes SÓ se o usuário marcou essa opção. */
export async function runImport(rows: unknown, updateExisting: boolean, fileName: string): Promise<{ ok: boolean; error?: string; created?: number; updated?: number; skipped?: number }> {
  const session = await getSession();
  const parsed = payloadSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Dados da planilha inválidos." };
  const preview = await previewImport(rows);
  if (!preview.ok || !preview.items) return { ok: false, error: preview.error };
  const supabase = await createClient();
  const byLine = new Map(preview.items.map((i) => [i.line, i]));

  const toCreate: { line: number; data: ImportData }[] = [];
  const toUpdate: { id: string; data: ImportData }[] = [];
  let skipped = 0;
  for (const r of parsed.data) {
    const p = byLine.get(r.line)!;
    if (p.action === "novo") toCreate.push(r);
    else if (p.action === "atualizar" && updateExisting && p.matchId) toUpdate.push({ id: p.matchId, data: r.data });
    else skipped++;
  }

  let created = 0;
  for (let i = 0; i < toCreate.length; i += 100) {
    const chunk = toCreate.slice(i, i + 100);
    const rowsToInsert = chunk.map(({ data }) => {
      const d: Record<string, unknown> = { ...data };
      delete d.features;
      return { ...d, category: "carro", body_type: guessBodyType(data.model), team_id: session.teamId, owner_id: session.userId, status: "disponivel" };
    });
    const { data, error } = await supabase.from("vehicles").insert(rowsToInsert).select("id");
    if (error) return { ok: false, error: `Erro ao importar o lote que começa na linha ${chunk[0].line}. ${created} veículo(s) já foram criados.`, created };
    created += data.length;
    const feats = data.flatMap((v, idx) => chunk[idx].data.features.map((name) => ({ team_id: session.teamId, vehicle_id: v.id, name })));
    if (feats.length) await supabase.from("vehicle_features").upsert(feats, { onConflict: "vehicle_id,name", ignoreDuplicates: true });
  }

  let updated = 0;
  for (const u of toUpdate) {
    const patch = Object.fromEntries(Object.entries(u.data).filter(([k, v]) => k !== "features" && k !== "stock_code" && v !== null));
    const { error } = await supabase.from("vehicles").update(patch).eq("id", u.id);
    if (!error) updated++;
  }

  await supabase.from("activities").insert({
    team_id: session.teamId, owner_id: session.userId, type: "sistema",
    title: `Importação de estoque: ${created} novos, ${updated} atualizados, ${skipped} ignorados`,
    description: fileName.slice(0, 200), metadata: { created, updated, skipped },
  });
  revalidatePath("/estoque");
  revalidatePath("/painel");
  revalidatePath("/");
  return { ok: true, created, updated, skipped };
}
