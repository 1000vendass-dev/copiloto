import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureConversation, findAccount, recordMessage } from "@/lib/whatsapp/ingest";
import { onlyDigits, shortId, toWaId } from "@/lib/whatsapp/phone";
import { sendText, wahaSession } from "@/lib/whatsapp/waha";

/**
 * Envio de UMA mensagem de texto pelo WhatsApp do Copiloto. Só é chamado por ação explícita do dono: o botão Enviar
 * do Copiloto (sendWhatsApp, com a sessão dele) ou o botão Enviar do jogo do escritório (rota /api/jogo, com a chave
 * do escritório). A IA nunca chama esta função: ela só cria rascunhos.
 */
export type EnvioResult = { ok: boolean; error?: string };

const SEND_GAP_MS = 3000;
export const SEND_FAILED = "Não consegui enviar. Confira se o WhatsApp do Copiloto está conectado.";

type Admin = ReturnType<typeof createAdminClient>;

export async function enviarTexto(admin: Admin, teamId: string, leadId: string, text: string, draftId?: string): Promise<EnvioResult> {
  const body = text.trim();
  if (!body) return { ok: false, error: "Escreva a mensagem." };
  if (body.length > 4000) return { ok: false, error: "Mensagem muito longa (máximo 4000 caracteres)." };

  const { data: lead } = await admin.from("leads").select("id,phone").eq("id", leadId).eq("team_id", teamId).maybeSingle();
  if (!lead) return { ok: false, error: "Lead não encontrado." };
  const waSession = wahaSession();
  const account = await findAccount(admin, waSession, teamId);
  if (!account) return { ok: false, error: "WhatsApp não configurado nesta equipe." };

  const { data: contact } = await admin.from("whatsapp_contacts").select("wa_id").eq("account_id", account.id).eq("lead_id", leadId).limit(1).maybeSingle();
  const waId = contact?.wa_id ?? toWaId(lead.phone);
  if (!waId) return { ok: false, error: "O lead não tem um telefone válido." };

  const conv = await ensureConversation(admin, account, waId, null, leadId);
  const { data: lastOut } = await admin.from("whatsapp_messages").select("created_at").eq("conversation_id", conv.id).eq("direction", "saida")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (lastOut && Date.now() - new Date(lastOut.created_at).getTime() < SEND_GAP_MS) {
    return { ok: false, error: "Aguarde alguns segundos antes de enviar outra mensagem." };
  }

  let sent: { id: string | null };
  try {
    sent = await sendText(waSession, `${onlyDigits(waId)}@c.us`, body);
  } catch (e) {
    console.error("[whatsapp/send]", e instanceof Error ? e.message : e);
    return { ok: false, error: SEND_FAILED };
  }
  await recordMessage(admin, account, conv, { externalId: sent.id ? shortId(sent.id) : null, direction: "saida", type: "texto", body, sentAt: new Date() });
  if (draftId) {
    await admin.from("whatsapp_drafts").update({ status: "enviado" }).eq("id", draftId).eq("lead_id", leadId).eq("team_id", teamId).eq("status", "pendente");
  }
  return { ok: true };
}
