"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { pushToUser } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type PushResult = { ok: boolean; error?: string; sent?: number };

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** Guarda o aparelho que aceitou receber notificações. */
export async function savePushSubscription(sub: unknown, userAgent?: string): Promise<PushResult> {
  const session = await getSession();
  const parsed = subSchema.safeParse(sub);
  if (!parsed.success) return { ok: false, error: "Inscrição inválida." };
  const supabase = await createClient();
  // o mesmo aparelho pode ter sido de outro login antes: troca o dono
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint).neq("user_id", session.userId);
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: session.userId, team_id: session.teamId, endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, user_agent: userAgent?.slice(0, 300) ?? null,
  }, { onConflict: "endpoint" });
  if (error) return { ok: false, error: "Não foi possível salvar este aparelho." };
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<PushResult> {
  await getSession();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

/** Manda uma notificação de teste para os aparelhos do próprio usuário. */
export async function sendTestPush(): Promise<PushResult> {
  const session = await getSession();
  const sent = await pushToUser(createAdminClient(), session.userId, {
    title: "Copiloto", body: "Notificações ativadas. É assim que as mensagens de clientes vão chegar.", url: "/leads", tag: "teste",
  });
  return sent ? { ok: true, sent } : { ok: false, error: "Nenhum aparelho recebeu. Ative de novo neste aparelho." };
}
