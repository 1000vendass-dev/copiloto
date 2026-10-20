"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { configSchema } from "./config";
import { startNightly } from "./jobs";
import { ensureProfile } from "./profile";

export type CopilotResult = { ok: boolean; error?: string };

const profileInput = z.object({ autonomy: z.number().int().min(0).max(2), config: configSchema });

/** Salva a IA do próprio usuário (identidade, autonomia, rotinas, metas, instruções). */
export async function saveAiProfile(input: unknown): Promise<CopilotResult> {
  const session = await getSession();
  const parsed = profileInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { config } = parsed.data;
  if (config.routines.window.from >= config.routines.window.to) return { ok: false, error: "A janela de trabalho precisa terminar depois de começar." };
  const supabase = await createClient();
  const { error } = await supabase.from("ai_profiles").upsert(
    { user_id: session.userId, team_id: session.teamId, autonomy: parsed.data.autonomy, config, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false, error: "Não foi possível salvar." };
  revalidatePath("/ia");
  return { ok: true };
}

/** "Rodar agora": dispara a rotina da noite já, em segundo plano. O resultado aparece em Atividade e no chat. */
export async function runNightlyNow(): Promise<CopilotResult> {
  const session = await getSession();
  const admin = createAdminClient();
  const profile = await ensureProfile(admin, session.userId, session.teamId);
  const res = await startNightly(admin, profile, "manual", `manual-${Date.now()}`);
  if (!res.ok) return { ok: false, error: res.reason };
  revalidatePath("/ia");
  return { ok: true };
}

const memScope = z.enum(["loja", "vendedor", "padrao", "preferencia"]);

/** Memória escrita pelo próprio vendedor (camada da loja e do vendedor). */
export async function addMemory(scope: string, content: string): Promise<CopilotResult> {
  const session = await getSession();
  const s = memScope.safeParse(scope);
  const text = content.trim();
  if (!s.success || !text || text.length > 500) return { ok: false, error: "Escreva o fato (até 500 caracteres)." };
  const { error } = await createAdminClient().from("ai_memory").insert({
    team_id: session.teamId, owner_id: session.userId, scope: s.data, content: text, importance: 4, status: "ativa", source: "voce", confidence: 5,
  });
  if (error) return { ok: false, error: "Não foi possível guardar." };
  revalidatePath("/ia");
  return { ok: true };
}

/** Aprova uma memória sugerida ou arquiva uma que não vale mais. */
export async function setMemoryStatus(id: string, status: "ativa" | "arquivada"): Promise<CopilotResult> {
  const session = await getSession();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Memória inválida." };
  const { error, count } = await createAdminClient().from("ai_memory")
    .update({ status, updated_at: new Date().toISOString() }, { count: "exact" }).eq("id", id).eq("team_id", session.teamId);
  if (error || !count) return { ok: false, error: "Não foi possível alterar." };
  revalidatePath("/ia");
  return { ok: true };
}
