"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mic, Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime, labelDay, ymdOf } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { discardDraft, markLeadConversationRead, sendWhatsApp, sendWhatsAppVoice } from "./actions";
import type { WaDraft, WaMessage } from "./queries";
import { fmtSeconds, useVoiceRecorder } from "./voice-recorder";

const textareaCls = "w-full resize-none rounded-2xl border border-border bg-surface px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand";

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
    <div className="glass space-y-2 rounded-3xl border-brand/40 p-3.5">
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

/**
 * Conversa em tela cheia, como no WhatsApp: as mensagens ocupam o espaço do pai (que precisa ser flex-col com
 * altura definida) e a caixa de texto fica presa embaixo. Os botões flutuantes ficam por cima das mensagens; o `pb-20` só deixa a última mensagem rolar para cima do botão +.
 */
export function WhatsAppChat({ leadId, messages, drafts, enabled = true }: { leadId: string; messages: WaMessage[]; drafts: WaDraft[]; enabled?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  // card aberto = conversa lida; também quando chega mensagem nova com o card na tela.
  // (as mensagens novas chegam sozinhas pelo LiveRefresh do layout, em tempo real)
  useEffect(() => {
    if (enabled && document.visibilityState === "visible") void markLeadConversationRead(leadId);
  }, [leadId, enabled, messages.length]);
  // rola só a lista (não a página) até a última mensagem
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length, drafts.length]);

  const send = () => start(async () => {
    setError(null);
    const r = await sendWhatsApp(leadId, text);
    if (!r.ok) { setError(r.error ?? "Erro ao enviar."); return; }
    setText("");
    router.refresh();
  });

  const voice = useVoiceRecorder();
  const sendVoice = () => start(async () => {
    setError(null);
    const blob = await voice.stop();
    if (!blob) return;
    const fd = new FormData();
    fd.append("leadId", leadId);
    fd.append("audio", new File([blob], "voz", { type: blob.type }));
    const r = await sendWhatsAppVoice(fd);
    if (!r.ok) { setError(r.error ?? "Erro ao enviar o áudio."); return; }
    router.refresh();
  });

  let lastDay = "";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pt-3 pb-20">
        {!enabled ? (
          <p className="mx-auto mt-8 max-w-xs text-center text-sm text-fg-muted">WhatsApp do Copiloto não está conectado nesta equipe.</p>
        ) : messages.length === 0 ? (
          <p className="mx-auto mt-8 max-w-xs text-center text-sm text-fg-muted">Nenhuma mensagem ainda. As conversas deste lead aparecem aqui.</p>
        ) : messages.map((m) => {
          const day = ymdOf(m.sent_at);
          const sep = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {sep ? <div className="my-3 flex justify-center"><span className="glass rounded-full px-3 py-1 text-[11px] font-semibold text-fg-muted">{labelDay(day)}</span></div> : null}
              <div className={cn("flex", m.direction === "saida" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-3xl px-3.5 py-2 text-[15px] leading-snug shadow-sm", m.direction === "saida" ? "rounded-br-md bg-brand text-white" : "glass rounded-bl-md")}>
                  {m.type === "audio" && m.media_path
                    ? <audio controls preload="none" src={`/api/whatsapp/media/${m.id}`} className="my-1 h-10 w-60 max-w-full" aria-label="Áudio" />
                    : <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  <div className={cn("text-right text-[10px]", m.direction === "saida" ? "text-white/70" : "text-fg-muted")}>{formatTime(m.sent_at)}</div>
                </div>
              </div>
            </div>
          );
        })}
        {drafts.map((d) => <Draft key={d.id} draft={d} leadId={leadId} />)}
      </div>

      {enabled ? (
        <div className="px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {error || voice.error ? <p className="px-1 pb-1 text-sm text-red-600" role="alert">{error ?? voice.error}</p> : null}
          {voice.recording ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={voice.cancel} aria-label="Descartar áudio" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-muted active:bg-muted"><Trash2 className="h-5 w-5" /></button>
              <div className="glass-float flex h-12 flex-1 items-center gap-2 rounded-3xl px-4" aria-live="polite">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
                <span className="tabular-nums">{fmtSeconds(voice.seconds)}</span>
                <span className="truncate text-sm text-fg-muted">Gravando…</span>
              </div>
              <Button size="icon" className="h-12 w-12 shrink-0 rounded-full" onClick={sendVoice} disabled={pending} aria-label="Enviar áudio"><Send className="h-5 w-5" /></Button>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                className="glass-float max-h-32 min-h-12 flex-1 resize-none rounded-3xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand/40"
                rows={1} placeholder="Mensagem" aria-label="Mensagem de WhatsApp" value={text} onChange={(e) => setText(e.target.value)} disabled={pending}
              />
              {text.trim() ? (
                <Button size="icon" className="h-12 w-12 shrink-0 rounded-full" onClick={send} disabled={pending} aria-label="Enviar"><Send className="h-5 w-5" /></Button>
              ) : (
                <Button size="icon" className="h-12 w-12 shrink-0 rounded-full" onClick={() => void voice.start()} disabled={pending} aria-label="Gravar áudio">
                  {pending ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" aria-hidden /> : <Mic className="h-5 w-5" />}
                </Button>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
