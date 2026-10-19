import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

/**
 * Notificações no celular (Web Push). As chaves VAPID ficam só na VPS:
 * VAPID_PUBLIC_KEY e VAPID_SUBJECT em .env, VAPID_PRIVATE_KEY em .secrets.env.
 */

export type PushPayload = { title: string; body: string; url: string; tag?: string };

let configured: boolean | null = null;
function ready(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  configured = Boolean(pub && priv);
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://copiloto.1000vendas.com", pub!, priv!);
  return configured;
}

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

/** Envia para aparelhos (já buscados). Apaga os que o navegador desativou (404/410). Nunca lança. */
async function deliver(admin: SupabaseClient, subs: Sub[], payload: PushPayload): Promise<number> {
  if (!ready() || !subs.length) return 0;
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("[push]", code ?? (e instanceof Error ? e.message : e));
    }
  }));
  return sent;
}

/** Para todos os aparelhos da equipe (ex.: mensagem nova de cliente). */
export async function pushToTeam(admin: SupabaseClient, teamId: string, payload: PushPayload): Promise<number> {
  if (!ready()) return 0;
  const { data } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("team_id", teamId);
  return deliver(admin, (data ?? []) as Sub[], payload);
}

/** Para os aparelhos de um usuário (ex.: teste em Configurações). */
export async function pushToUser(admin: SupabaseClient, userId: string, payload: PushPayload): Promise<number> {
  if (!ready()) return 0;
  const { data } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", userId);
  return deliver(admin, (data ?? []) as Sub[], payload);
}
