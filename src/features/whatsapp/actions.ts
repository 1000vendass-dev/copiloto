"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { changeLeadStage } from "@/features/crm/actions";
import { OPEN_STAGES } from "@/features/crm/constants";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ensureConversation, findAccount, recordMessage } from "@/lib/whatsapp/ingest";
import { onlyDigits, shortId, toWaId } from "@/lib/whatsapp/phone";
import { sendText, wahaSession } from "@/lib/whatsapp/waha";
import { CONTACT_TYPES, NOT_CUSTOMER_PREFIX } from "./contact-types";

export type WaResult = { ok: boolean; error?: string };

const uuid = z.string().uuid();
const SEND_GAP_MS = 3000;

/**
 * Envia UMA mensagem pelo WhatsApp do Copiloto. Só roda por ação explícita do vendedor logado
 * (botão Enviar). A IA não chama esta função: ela só cria rascunhos.
 */
export async function sendWhatsApp(leadId: string, text: string, draftId?: string): Promise<WaResult> {
  const session = await getSession();
  const body = text.trim();
  if (!uuid.safeParse(leadId).success) return { ok: false, error: "Lead inválido." };
  if (!body) return { ok: false, error: "Escreva a mensagem." };
  if (body.length > 4000) return { ok: false, error: "Mensagem muito longa (máximo 4000 caracteres)." };

  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("id,phone").eq("id", leadId).maybeSingle();
  if (!lead) return { ok: false, error: "Lead não encontrado." };

  const admin = createAdminClient();
  const waSession = wahaSession();
  const account = await findAccount(admin, waSession, session.teamId);
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
    return { ok: false, error: "Não consegui enviar. Confira se o WhatsApp do Copiloto está conectado." };
  }

  await recordMessage(admin, account, conv, {
    externalId: sent.id ? shortId(sent.id) : null, direction: "saida", type: "texto", body, sentAt: new Date(),
  });
  if (draftId && uuid.safeParse(draftId).success) {
    await supabase.from("whatsapp_drafts").update({ status: "enviado" }).eq("id", draftId).eq("lead_id", leadId).eq("status", "pendente");
  }
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function discardDraft(draftId: string, leadId: string): Promise<WaResult> {
  await getSession();
  if (!uuid.safeParse(draftId).success) return { ok: false, error: "Rascunho inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("whatsapp_drafts").update({ status: "descartado" }).eq("id", draftId).eq("status", "pendente");
  if (error) return { ok: false, error: "Não foi possível descartar." };
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

/**
 * Muda o tipo do contato (cliente, loja, parceiro...). Quem não é cliente sai do funil como Perdido;
 * voltar para Cliente reabre o lead como Novo, se ele foi fechado por esta regra.
 */
export async function setContactType(leadId: string, type: string): Promise<WaResult> {
  await getSession();
  if (!uuid.safeParse(leadId).success || !CONTACT_TYPES.some((t) => t.value === type)) return { ok: false, error: "Dados inválidos." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("whatsapp_contacts").update({ categoria: type }, { count: "exact" }).eq("lead_id", leadId);
  if (error || !count) return { ok: false, error: "Não foi possível salvar o tipo do contato." };

  const { data: lead } = await supabase.from("leads").select("stage,lost_reason").eq("id", leadId).maybeSingle();
  if (lead && type !== "cliente" && (OPEN_STAGES as string[]).includes(lead.stage)) {
    await changeLeadStage(leadId, "perdido", NOT_CUSTOMER_PREFIX + type);
  } else if (lead && type === "cliente" && lead.stage === "perdido" && lead.lost_reason?.startsWith(NOT_CUSTOMER_PREFIX)) {
    await changeLeadStage(leadId, "novo");
  }
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

/** Zera o contador de não lidas ao abrir o card. */
export async function markLeadConversationRead(leadId: string): Promise<void> {
  await getSession();
  if (!uuid.safeParse(leadId).success) return;
  const supabase = await createClient();
  const { data: contacts } = await supabase.from("whatsapp_contacts").select("id").eq("lead_id", leadId);
  const ids = (contacts ?? []).map((c) => c.id);
  if (ids.length) await supabase.from("whatsapp_conversations").update({ unread_count: 0 }).in("contact_id", ids).gt("unread_count", 0);
}
