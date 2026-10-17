"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";
import { discardDraft, markLeadConversationRead, sendWhatsApp } from "./actions";
import type { WaDraft, WaMessage } from "./queries";

const REFRESH_MS = 15_000;
const textareaCls = "w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand";

function Draft({ draft, leadId }: { draft: WaDraft; leadId: string }) {
  const router = useRouter();
  const [text, setText] = useState(draft.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () => start(async () => {
    setError(null);
    const r = await sendWhatsApp(leadId, text, draft.id);
    if (!r.ok) setError(r.error ?? "Erro ao enviar."); else router.refresh();
  });
  const discard = () => start(async () => {
    const r = await discardDraft(draft.id, leadId);
    if (!r.ok) setError(r.error ?? "Erro ao descartar."); else router.refresh();
  });

  return (
    <div className="space-y-2 rounded-lg border border-brand/40 bg-muted p-3">
      <div className="flex items-center gap-1 text-xs font-medium text-brand">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />{draft.source === "ia" ? "Rascunho do Copiloto — nada foi enviado" : "Rascunho"}
      </div>
      <textarea className={textareaCls} rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={pending} />
      {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={discard} disabled={pending}><Trash2 className="h-4 w-4" />Descartar</Button>
        <Button size="sm" onClick={send} disabled={pending || !text.trim()}><Send className="h-4 w-4" />Enviar</Button>
      </div>
    </div>
  );
}

export function WhatsAppChat({ leadId, messages, drafts }: { leadId: string; messages: WaMessage[]; drafts: WaDraft[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void markLeadConversationRead(leadId); }, [leadId]);
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  const send = () => start(async () => {
    setError(null);
    const r = await sendWhatsApp(leadId, text);
    if (!r.ok) { setError(r.error ?? "Erro ao enviar."); return; }
    setText("");
    router.refresh();
  });

  return (
    <div className="space-y-3">
      <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-border bg-bg p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-fg-muted">Nenhuma mensagem ainda. As conversas deste lead aparecem aqui.</p>
        ) : messages.map((m) => (
          <div key={m.id} className={cn("flex", m.direction === "saida" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.direction === "saida" ? "bg-brand text-white" : "border border-border bg-surface")}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <div className={cn("mt-1 text-[11px]", m.direction === "saida" ? "text-white/70" : "text-fg-muted")}>{formatDateTime(m.sent_at)}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {drafts.map((d) => <Draft key={d.id} draft={d} leadId={leadId} />)}

      <div className="space-y-2">
        <textarea className={textareaCls} rows={2} placeholder="Escreva uma mensagem…" value={text} onChange={(e) => setText(e.target.value)} disabled={pending} />
        {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
        <div className="flex justify-end">
          <Button onClick={send} disabled={pending || !text.trim()}><Send className="h-4 w-4" />Enviar</Button>
        </div>
      </div>
    </div>
  );
}
