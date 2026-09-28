"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IMAGE_BUCKET } from "./constants";
import { vehicleSchema } from "./schemas";

export type ActionResult = { ok: boolean; error?: string; id?: string };
const uuid = z.string().uuid();

function formToObject(fd: FormData) {
  const o: Record<string, string> = {};
  fd.forEach((v, k) => { if (typeof v === "string") o[k] = v; });
  return o;
}
function features(fd: FormData) {
  const raw = String(fd.get("features") ?? "");
  return [...new Set(raw.split(/[\n,;]/).map((f) => f.trim()).filter(Boolean).map((f) => f.slice(0, 80)))].slice(0, 60);
}
function friendly(msg?: string) {
  if (msg && /vehicles_stock_code_uq|duplicate key/i.test(msg)) return "Já existe um veículo com esse código de estoque.";
  if (msg && /row-level security/i.test(msg)) return "Você não tem permissão para esta ação.";
  return "Não foi possível salvar. Tente novamente.";
}
function revalidateInventory(id?: string) {
  revalidatePath("/estoque");
  revalidatePath("/");
  if (id) revalidatePath(`/estoque/${id}`);
}

async function syncFeatures(vehicleId: string, teamId: string, list: string[]) {
  const supabase = await createClient();
  await supabase.from("vehicle_features").delete().eq("vehicle_id", vehicleId);
  if (list.length) {
    await supabase.from("vehicle_features").insert(list.map((name) => ({ team_id: teamId, vehicle_id: vehicleId, name })));
  }
}

export async function createVehicle(_: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const session = await getSession();
  const parsed = vehicleSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .insert({ ...parsed.data, team_id: session.teamId, owner_id: session.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendly(error.message) };
  await syncFeatures(data.id, session.teamId, features(fd));
  revalidateInventory(data.id);
  redirect(`/estoque/${data.id}`);
}

export async function updateVehicle(_: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const session = await getSession();
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Veículo inválido." };
  const parsed = vehicleSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error, count } = await supabase.from("vehicles").update(parsed.data, { count: "exact" }).eq("id", id.data);
  if (error || !count) return { ok: false, error: friendly(error?.message) };
  await syncFeatures(id.data, session.teamId, features(fd));
  revalidateInventory(id.data);
  return { ok: true, id: id.data };
}

export async function setVehicleStatus(vehicleId: string, status: string): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(vehicleId).success || !["disponivel", "reservado", "vendido", "inativo"].includes(status)) {
    return { ok: false, error: "Dados inválidos." };
  }
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "vendido") patch.sold_at = new Date().toISOString().slice(0, 10);
  if (status === "disponivel") { patch.reserved_lead_id = null; patch.sold_lead_id = null; patch.sold_at = null; patch.sold_price = null; }
  const { error } = await supabase.from("vehicles").update(patch).eq("id", vehicleId);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateInventory(vehicleId);
  return { ok: true };
}

/** Alto risco — UI pede confirmação. Remove também as fotos do Storage. */
export async function deleteVehicle(vehicleId: string): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(vehicleId).success) return { ok: false, error: "Veículo inválido." };
  const supabase = await createClient();
  const { data: imgs } = await supabase.from("vehicle_images").select("storage_path").eq("vehicle_id", vehicleId);
  const { error, count } = await supabase.from("vehicles").delete({ count: "exact" }).eq("id", vehicleId);
  if (error) return { ok: false, error: friendly(error.message) };
  if (!count) return { ok: false, error: "Só quem cadastrou ou um administrador pode excluir." };
  if (imgs?.length) await supabase.storage.from(IMAGE_BUCKET).remove(imgs.map((i) => i.storage_path));
  revalidateInventory();
  redirect("/estoque");
}

/* ------------------------------ fotos ------------------------------ */

/** Registra fotos já enviadas pelo navegador ao Storage (caminho {team}/{vehicle}/...). */
export async function registerImages(vehicleId: string, paths: string[]): Promise<ActionResult> {
  const session = await getSession();
  if (!uuid.safeParse(vehicleId).success) return { ok: false, error: "Veículo inválido." };
  const prefix = `${session.teamId}/${vehicleId}/`;
  const valid = paths.filter((p) => p.startsWith(prefix) && !p.includes("..")).slice(0, 40);
  if (!valid.length) return { ok: false, error: "Nenhuma foto válida." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("vehicle_images").select("position,is_primary").eq("vehicle_id", vehicleId);
  let pos = Math.max(-1, ...(existing ?? []).map((e) => e.position)) + 1;
  const hasPrimary = (existing ?? []).some((e) => e.is_primary);
  const rows = valid.map((p, i) => ({
    team_id: session.teamId, vehicle_id: vehicleId, storage_path: p, position: pos++, is_primary: !hasPrimary && i === 0,
  }));
  const { error } = await supabase.from("vehicle_images").insert(rows);
  if (error) {
    await supabase.storage.from(IMAGE_BUCKET).remove(valid); // não deixa arquivo órfão
    return { ok: false, error: friendly(error.message) };
  }
  revalidateInventory(vehicleId);
  return { ok: true };
}

export async function deleteImage(imageId: string): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(imageId).success) return { ok: false, error: "Foto inválida." };
  const supabase = await createClient();
  const { data: img } = await supabase.from("vehicle_images").select("id,vehicle_id,storage_path,is_primary").eq("id", imageId).maybeSingle();
  if (!img) return { ok: false, error: "Foto não encontrada." };
  const { error } = await supabase.from("vehicle_images").delete().eq("id", imageId);
  if (error) return { ok: false, error: friendly(error.message) };
  await supabase.storage.from(IMAGE_BUCKET).remove([img.storage_path]);
  if (img.is_primary) {
    const { data: next } = await supabase.from("vehicle_images").select("id").eq("vehicle_id", img.vehicle_id).order("position").limit(1).maybeSingle();
    if (next) await supabase.from("vehicle_images").update({ is_primary: true }).eq("id", next.id);
  }
  revalidateInventory(img.vehicle_id);
  return { ok: true };
}

export async function setPrimaryImage(imageId: string): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(imageId).success) return { ok: false, error: "Foto inválida." };
  const supabase = await createClient();
  const { data: img } = await supabase.from("vehicle_images").select("vehicle_id").eq("id", imageId).maybeSingle();
  if (!img) return { ok: false, error: "Foto não encontrada." };
  await supabase.from("vehicle_images").update({ is_primary: false }).eq("vehicle_id", img.vehicle_id).eq("is_primary", true);
  const { error } = await supabase.from("vehicle_images").update({ is_primary: true }).eq("id", imageId);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateInventory(img.vehicle_id);
  return { ok: true };
}

/** Move a foto uma posição para a esquerda (-1) ou direita (+1). */
export async function moveImage(imageId: string, dir: -1 | 1): Promise<ActionResult> {
  await getSession();
  if (!uuid.safeParse(imageId).success) return { ok: false, error: "Foto inválida." };
  const supabase = await createClient();
  const { data: img } = await supabase.from("vehicle_images").select("vehicle_id").eq("id", imageId).maybeSingle();
  if (!img) return { ok: false, error: "Foto não encontrada." };
  const { data: all } = await supabase.from("vehicle_images").select("id,position").eq("vehicle_id", img.vehicle_id).order("position");
  const list = all ?? [];
  const i = list.findIndex((x) => x.id === imageId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(list.map((x, idx) => supabase.from("vehicle_images").update({ position: idx }).eq("id", x.id)));
  revalidateInventory(img.vehicle_id);
  return { ok: true };
}
