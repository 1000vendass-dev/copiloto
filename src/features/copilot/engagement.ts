import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Engajamento de cada lead, medido nas conversas do WhatsApp (janela de 30 dias): quem respondeu, quando e
 * quantas mensagens minhas ficaram sem resposta. É o que separa "quente no cadastro" de "respondendo de verdade".
 */

export type Engagement = {
  respostas3d: number;
  ultimaDele: string | null;
  ultimaMinha: string | null;
  semResposta: number;
  primeiraMinha: string | null;
  /** Hora (SP) de cada mensagem do cliente na janela: mostra em que horário ele costuma responder. */
  horasDele: number[];
};

const WINDOW_MS = 30 * 86400000;
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const empty = (): Engagement => ({ respostas3d: 0, ultimaDele: null, ultimaMinha: null, semResposta: 0, primeiraMinha: null, horasDele: [] });
const horaSP = (iso: string) => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date(iso))) % 24;

export async function loadEngagement(sb: SupabaseClient, leadIds: string[]): Promise<Map<string, Engagement>> {
  const out = new Map<string, Engagement>(leadIds.map((id) => [id, empty()]));
  if (!leadIds.length) return out;

  const contacts: { id: string; lead_id: string }[] = [];
  for (const ids of chunk(leadIds, 80)) {
    const { data } = await sb.from("whatsapp_contacts").select("id,lead_id").in("lead_id", ids);
    contacts.push(...((data ?? []) as { id: string; lead_id: string }[]));
  }
  if (!contacts.length) return out;

  const convs: { id: string; contact_id: string }[] = [];
  for (const ids of chunk(contacts.map((c) => c.id), 80)) {
    const { data } = await sb.from("whatsapp_conversations").select("id,contact_id").in("contact_id", ids);
    convs.push(...((data ?? []) as { id: string; contact_id: string }[]));
  }
  const leadOfContact = new Map(contacts.map((c) => [c.id, c.lead_id]));
  const leadOfConv = new Map(convs.map((c) => [c.id, leadOfContact.get(c.contact_id)!]));

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const rows: { conversation_id: string; direction: string; sent_at: string }[] = [];
  for (const ids of chunk(convs.map((c) => c.id), 60)) {
    const { data } = await sb.from("whatsapp_messages").select("conversation_id,direction,sent_at")
      .in("conversation_id", ids).gte("sent_at", since).order("sent_at", { ascending: true }).limit(5000);
    rows.push(...((data ?? []) as typeof rows));
  }
  rows.sort((a, b) => a.sent_at.localeCompare(b.sent_at));

  const threeDays = Date.now() - 3 * 86400000;
  for (const m of rows) {
    const lead = leadOfConv.get(m.conversation_id);
    const e = lead ? out.get(lead) : null;
    if (!e) continue;
    if (m.direction === "entrada") {
      e.ultimaDele = m.sent_at;
      e.semResposta = 0;
      e.horasDele.push(horaSP(m.sent_at));
      if (Date.parse(m.sent_at) >= threeDays) e.respostas3d++;
    } else {
      e.ultimaMinha = m.sent_at;
      e.semResposta++;
      e.primeiraMinha ??= m.sent_at;
    }
  }
  return out;
}
