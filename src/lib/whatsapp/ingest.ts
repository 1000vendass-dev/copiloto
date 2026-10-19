import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { OPEN_STAGES } from "@/features/crm/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { onlyDigits, sameNumber, shortId, toWaId } from "./phone";
import { pushToTeam } from "@/lib/push";
import { processAudio, saveMedia } from "./media";
import { downloadWahaFile, resolveLid, wahaSession } from "./waha";

type Admin = SupabaseClient;
type Json = Record<string, unknown>;

export type Account = { id: string; team_id: string; owner_id: string | null };
export type Conversation = { id: string; contactId: string; leadId: string; unread: number };

const asRec = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const asStr = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

const WHATSAPP_ACTIVITY_GAP_MS = 6 * 3600 * 1000;

/** Conta WAHA cadastrada (whatsapp_accounts.provider='waha', external_id = nome da sessão). */
export async function findAccount(admin: Admin, session: string, teamId?: string): Promise<Account | null> {
  let q = admin.from("whatsapp_accounts").select("id,team_id,owner_id").eq("provider", "waha").eq("external_id", session);
  if (teamId) q = q.eq("team_id", teamId);
  const { data } = await q.maybeSingle();
  return data ?? null;
}

async function findLeadByPhone(admin: Admin, teamId: string, waId: string): Promise<string | null> {
  const { data } = await admin
    .from("leads").select("id,phone,stage,updated_at").eq("team_id", teamId).not("phone", "is", null)
    .order("updated_at", { ascending: false }).limit(3000);
  const hits = (data ?? []).filter((l) => sameNumber(onlyDigits(l.phone), waId));
  const open = hits.find((l) => (OPEN_STAGES as string[]).includes(l.stage));
  return (open ?? hits[0])?.id ?? null;
}

async function createLead(admin: Admin, account: Account, waId: string, name: string | null): Promise<string> {
  const { data, error } = await admin
    .from("leads")
    .insert({ team_id: account.team_id, owner_id: account.owner_id, name: name ?? `+${waId}`, phone: `+${waId}`, source: "WhatsApp", stage: "novo" })
    .select("id").single();
  if (error || !data) throw new Error(`Não foi possível criar o lead: ${error?.message}`);
  await admin.from("activities").insert({
    team_id: account.team_id, owner_id: account.owner_id, lead_id: data.id, type: "lead_criado",
    title: "Lead criado pelo WhatsApp", description: "Primeira mensagem recebida pelo número do Copiloto.",
  });
  return data.id;
}

/** Contato + conversa + lead (cria o que faltar). */
export async function ensureConversation(
  admin: Admin, account: Account, waId: string, profileName: string | null, leadHint?: string,
): Promise<Conversation> {
  const pick = () => admin.from("whatsapp_contacts").select("id,lead_id,profile_name").eq("account_id", account.id).eq("wa_id", waId).maybeSingle();
  let { data: contact } = await pick();
  if (!contact) {
    const ins = await admin.from("whatsapp_contacts")
      .insert({ team_id: account.team_id, account_id: account.id, wa_id: waId, profile_name: profileName })
      .select("id,lead_id,profile_name").single();
    if (ins.error) {
      contact = (await pick()).data; // corrida entre dois webhooks
      if (!contact) throw new Error(ins.error.message);
    } else contact = ins.data;
  }

  let leadId: string | null = contact.lead_id;
  if (!leadId) {
    leadId = leadHint ?? (await findLeadByPhone(admin, account.team_id, waId)) ?? (await createLead(admin, account, waId, profileName));
    await admin.from("whatsapp_contacts").update({ lead_id: leadId }).eq("id", contact.id);
  }
  if (profileName && !contact.profile_name) await admin.from("whatsapp_contacts").update({ profile_name: profileName }).eq("id", contact.id);

  const pickConv = () => admin.from("whatsapp_conversations").select("id,unread_count").eq("account_id", account.id).eq("contact_id", contact!.id).maybeSingle();
  let { data: conv } = await pickConv();
  if (!conv) {
    const ins = await admin.from("whatsapp_conversations")
      .insert({ team_id: account.team_id, account_id: account.id, contact_id: contact.id }).select("id,unread_count").single();
    if (ins.error) {
      conv = (await pickConv()).data;
      if (!conv) throw new Error(ins.error.message);
    } else conv = ins.data;
  }
  return { id: conv.id, contactId: contact.id, leadId, unread: conv.unread_count ?? 0 };
}

export type NewMessage = {
  externalId: string | null; direction: "entrada" | "saida"; type: string; body: string; sentAt: Date;
};

/** Grava a mensagem (idempotente por external_id), atualiza conversa, lead e timeline. */
export async function recordMessage(admin: Admin, account: Account, conv: Conversation, m: NewMessage): Promise<{ duplicate: boolean }> {
  // Eco de uma mensagem enviada pelo Copiloto (gravada sem id): só completa o id, não duplica.
  if (m.direction === "saida" && m.externalId) {
    const from = new Date(m.sentAt.getTime() - 120_000).toISOString();
    const to = new Date(m.sentAt.getTime() + 120_000).toISOString();
    const { data: pending } = await admin.from("whatsapp_messages").select("id").eq("conversation_id", conv.id).eq("direction", "saida")
      .is("external_id", null).eq("body", m.body).gte("sent_at", from).lte("sent_at", to).limit(1).maybeSingle();
    if (pending) {
      await admin.from("whatsapp_messages").update({ external_id: m.externalId }).eq("id", pending.id);
      return { duplicate: true };
    }
  }
  const { error } = await admin.from("whatsapp_messages").insert({
    team_id: account.team_id, conversation_id: conv.id, external_id: m.externalId, direction: m.direction,
    type: m.type, body: m.body, sent_at: m.sentAt.toISOString(),
  });
  if (error) {
    if (error.code === "23505") return { duplicate: true };
    throw new Error(error.message);
  }
  const sentAt = m.sentAt.toISOString();
  await admin.from("whatsapp_conversations")
    .update({ last_message_at: sentAt, unread_count: m.direction === "entrada" ? conv.unread + 1 : 0 }).eq("id", conv.id);
  await admin.from("leads").update({ last_contact_at: sentAt }).eq("id", conv.leadId);

  // 1 item na timeline por conversa a cada 6h (o histórico completo fica no chat do card)
  const { data: last } = await admin.from("activities").select("occurred_at").eq("lead_id", conv.leadId).eq("type", "whatsapp")
    .order("occurred_at", { ascending: false }).limit(1).maybeSingle();
  if (!last || m.sentAt.getTime() - new Date(last.occurred_at).getTime() > WHATSAPP_ACTIVITY_GAP_MS) {
    await admin.from("activities").insert({
      team_id: account.team_id, owner_id: account.owner_id, lead_id: conv.leadId, type: "whatsapp", title: "Conversa no WhatsApp",
      description: `${m.direction === "entrada" ? "Cliente" : "Você"}: ${m.body.slice(0, 300)}`, occurred_at: sentAt,
    });
  }
  return { duplicate: false };
}

const MESSAGE_KINDS: [string, string, string][] = [
  ["imageMessage", "imagem", "imagem"], ["audioMessage", "audio", "áudio"], ["videoMessage", "video", "vídeo"],
  ["documentMessage", "documento", "documento"], ["stickerMessage", "imagem", "figurinha"], ["locationMessage", "localizacao", "localização"],
];
/** Embrulhos em que o WhatsApp manda a mensagem de verdade (visualização única, temporária, documento com legenda). */
const WRAPPERS = ["viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension", "ephemeralMessage", "documentWithCaptionMessage"];
const MEDIA_TYPES = ["audio", "imagem", "video", "documento"];

function findKind(msg: Json | null, depth = 0): [string, string, string] | null {
  if (!msg || depth > 3) return null;
  const kind = MESSAGE_KINDS.find(([k]) => k in msg);
  if (kind) return kind;
  for (const w of WRAPPERS) {
    const inner = findKind(asRec(asRec(msg[w])?.message), depth + 1);
    if (inner) return inner;
  }
  return null;
}

/** Processa um evento de mensagem do WAHA. Devolve um rótulo do que aconteceu (para log/teste). */
export async function handleWahaEvent(admin: Admin, evt: Json): Promise<string> {
  const event = asStr(evt.event);
  if (event !== "message.any" && event !== "message") return "ignored_event";
  const session = asStr(evt.session) ?? "default";
  const p = asRec(evt.payload);
  if (!p) return "no_payload";

  const fromMe = p.fromMe === true;
  const data = asRec(p._data);
  const key = asRec(data?.key);
  // remoteJid é o outro lado da conversa nos dois sentidos; "to" nem sempre vem nas mensagens enviadas
  let chat = asStr(key?.remoteJid) ?? asStr(fromMe ? p.to : p.from);
  if (!chat) return "no_chat";
  if (/@(g\.us|broadcast|newsletter)$/.test(chat) || chat.startsWith("status@")) return "ignored_chat";
  if (chat.endsWith("@lid")) chat = asStr(key?.remoteJidAlt) ?? (await resolveLid(session, chat)) ?? chat;
  if (chat.endsWith("@lid")) return "unresolved_lid";
  const waId = onlyDigits(chat.split("@")[0]);
  if (waId.length < 8) return "bad_number";

  let type = "texto";
  let label = "";
  const kind = findKind(asRec(data?.message));
  if (kind) [, type, label] = kind;
  const media = asRec(p.media);
  const mediaUrl = asStr(media?.url);
  if (type === "texto" && p.hasMedia === true) {
    // formato que não reconhecemos (ex.: visualização única): decide pelo tipo do arquivo
    const mime = asStr(media?.mimetype) ?? "";
    [type, label] = mime.startsWith("image/") ? ["imagem", "imagem"] : mime.startsWith("video/") ? ["video", "vídeo"]
      : mime.startsWith("audio/") ? ["audio", "áudio"] : mime ? ["documento", "documento"] : ["outro", "mídia"];
  }
  const body = (asStr(p.body) ?? "") || (label ? `[${label}]` : "");
  if (!body) return "empty"; // reações, mensagens de protocolo etc.

  const account = await findAccount(admin, session);
  if (!account) return "no_account";

  const rawId = asStr(p.id) ?? asStr(key?.id);
  const ts = typeof p.timestamp === "number" ? p.timestamp : Number(p.timestamp);
  const sentAt = Number.isFinite(ts) && ts > 0 ? new Date(ts > 1e12 ? ts : ts * 1000) : new Date();
  const pushName = fromMe ? null : (asStr(data?.pushName) ?? asStr(data?.notifyName));

  const conv = await ensureConversation(admin, account, waId, pushName);
  const externalId = rawId ? shortId(rawId) : null;
  const res = await recordMessage(admin, account, conv, {
    externalId, direction: fromMe ? "saida" : "entrada", type, body, sentAt,
  });

  // mídia (do cliente ou enviada pelo celular): baixa já, porque o WAHA apaga o arquivo em ~3 min.
  // Áudio também é transcrito (só para a IA); foto, vídeo e documento só ficam guardados para ver no card.
  if (mediaUrl && externalId && MEDIA_TYPES.includes(type)) {
    const { data: row } = await admin.from("whatsapp_messages").select("id,media_path")
      .eq("conversation_id", conv.id).eq("external_id", externalId).maybeSingle();
    if (row && !row.media_path) {
      const msgRef = { id: row.id, teamId: account.team_id };
      void downloadWahaFile(mediaUrl)
        .then((f) => (type === "audio" ? processAudio(admin, msgRef, f.bytes, f.mimetype) : saveMedia(admin, msgRef, f.bytes, f.mimetype)))
        .catch((e) => console.error(`[whatsapp/${type}] baixar:`, e instanceof Error ? e.message : e));
    }
  }

  // notificação no celular: só mensagem nova de cliente (não as antigas que o WhatsApp ressincroniza)
  if (!fromMe && !res.duplicate && Date.now() - sentAt.getTime() < NOTIFY_MAX_AGE_MS) {
    void notifyIncoming(admin, account.team_id, conv, type, body)
      .catch((e) => console.error("[push] mensagem:", e instanceof Error ? e.message : e));
  }
  return res.duplicate ? "duplicate" : "ok";
}

const NOTIFY_MAX_AGE_MS = 10 * 60 * 1000;
const PREVIEW: Record<string, string> = { audio: "🎤 Áudio", imagem: "📷 Foto", video: "🎥 Vídeo", documento: "📄 Documento", localizacao: "📍 Localização" };

async function notifyIncoming(admin: Admin, teamId: string, conv: Conversation, type: string, body: string) {
  const [{ data: contact }, { data: lead }] = await Promise.all([
    admin.from("whatsapp_contacts").select("categoria,profile_name").eq("id", conv.contactId).maybeSingle(),
    admin.from("leads").select("name").eq("id", conv.leadId).maybeSingle(),
  ]);
  if (contact?.categoria === "spam" || contact?.categoria === "proprio") return;
  const text = PREVIEW[type] ?? (body.length > 140 ? `${body.slice(0, 137)}…` : body);
  await pushToTeam(admin, teamId, {
    title: lead?.name ?? contact?.profile_name ?? "Mensagem nova",
    body: text,
    url: `/leads/${conv.leadId}`,
    tag: `lead-${conv.leadId}`,
  });
}

/**
 * Garante que um lead com telefone tenha contato do WhatsApp (assim a conversa e o "Tipo de contato" aparecem
 * no card). Não rouba número já ligado a outro lead. Falha em silêncio: o lead já foi salvo.
 */
export async function linkLeadToWhatsApp(teamId: string, leadId: string, phone: string | null | undefined): Promise<void> {
  const waId = toWaId(phone);
  if (!waId) return;
  try {
    const admin = createAdminClient();
    const account = await findAccount(admin, wahaSession(), teamId);
    if (!account) return;
    const { data: hit } = await admin.from("whatsapp_contacts").select("id,lead_id").eq("account_id", account.id).eq("wa_id", waId).maybeSingle();
    if (hit) {
      if (!hit.lead_id) await admin.from("whatsapp_contacts").update({ lead_id: leadId }).eq("id", hit.id);
      return;
    }
    const { data: linked } = await admin.from("whatsapp_contacts").select("id").eq("lead_id", leadId).limit(1).maybeSingle();
    if (linked) return;
    await admin.from("whatsapp_contacts").insert({ team_id: account.team_id, account_id: account.id, wa_id: waId, lead_id: leadId });
  } catch (e) {
    console.error("[whatsapp/link]", e instanceof Error ? e.message : e);
  }
}
