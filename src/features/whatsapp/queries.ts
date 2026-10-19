import "server-only";

import { createClient } from "@/lib/supabase/server";

export type WaMessage = { id: string; direction: "entrada" | "saida"; type: string; body: string | null; sent_at: string };
export type WaDraft = { id: string; body: string; source: "ia" | "manual"; created_at: string };

/** Conversa do WhatsApp de um lead + rascunhos pendentes (lido com a sessão do usuário, RLS aplicada). */
export async function getLeadWhatsApp(leadId: string) {
  const supabase = await createClient();
  const [account, contacts, drafts] = await Promise.all([
    supabase.from("whatsapp_accounts").select("id").eq("provider", "waha").limit(1).maybeSingle(),
    supabase.from("whatsapp_contacts").select("id,categoria").eq("lead_id", leadId),
    supabase.from("whatsapp_drafts").select("id,body,source,created_at").eq("lead_id", leadId).eq("status", "pendente").order("created_at", { ascending: false }),
  ]);

  let messages: WaMessage[] = [];
  const contactIds = (contacts.data ?? []).map((c) => c.id);
  if (contactIds.length) {
    const { data: convs } = await supabase.from("whatsapp_conversations").select("id").in("contact_id", contactIds);
    const convIds = (convs ?? []).map((c) => c.id);
    if (convIds.length) {
      const { data } = await supabase.from("whatsapp_messages").select("id,direction,type,body,sent_at")
        .in("conversation_id", convIds).order("sent_at", { ascending: false }).limit(100);
      messages = ((data ?? []) as WaMessage[]).reverse();
    }
  }
  const contactType = (contacts.data?.[0]?.categoria as string | undefined) ?? null;
  return { enabled: Boolean(account.data), messages, drafts: (drafts.data ?? []) as WaDraft[], contactType };
}
