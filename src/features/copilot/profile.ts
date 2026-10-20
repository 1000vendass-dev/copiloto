import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultConfig, parseConfig, type AiConfig } from "./config";

export type AiProfile = { userId: string; teamId: string; autonomy: 0 | 1 | 2; config: AiConfig };

const toProfile = (r: { user_id: string; team_id: string; autonomy: number; config: unknown }): AiProfile => ({
  userId: r.user_id, teamId: r.team_id, autonomy: (r.autonomy === 0 || r.autonomy === 2 ? r.autonomy : 1) as 0 | 1 | 2, config: parseConfig(r.config),
});

export async function getProfile(sb: SupabaseClient, userId: string): Promise<AiProfile | null> {
  const { data } = await sb.from("ai_profiles").select("user_id,team_id,autonomy,config").eq("user_id", userId).maybeSingle();
  return data ? toProfile(data) : null;
}

/** Garante que o usuário tenha um perfil (padrão: nível 1, personalidade Parceiro). */
export async function ensureProfile(admin: SupabaseClient, userId: string, teamId: string): Promise<AiProfile> {
  const have = await getProfile(admin, userId);
  if (have) return have;
  const config = defaultConfig();
  await admin.from("ai_profiles").upsert({ user_id: userId, team_id: teamId, autonomy: 1, config }, { onConflict: "user_id", ignoreDuplicates: true });
  return { userId, teamId, autonomy: 1, config };
}

/** Fatos ativos sobre a loja e o vendedor (camada 1 da memória), mais importantes primeiro. */
export async function storeFacts(sb: SupabaseClient, teamId: string, limit = 25): Promise<string[]> {
  const { data } = await sb.from("ai_memory").select("content")
    .eq("team_id", teamId).eq("status", "ativa").in("scope", ["loja", "vendedor", "preferencia", "geral", "padrao"])
    .order("importance", { ascending: false }).order("updated_at", { ascending: false }).limit(limit);
  return (data ?? []).map((m) => m.content as string);
}
