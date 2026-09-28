"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Action = { tool: string; ok: boolean; status: string; summary: string };
type Msg = { id?: string; role: "user" | "assistant"; content: string; meta?: { actions?: Action[] }; pending?: boolean; error?: boolean };

const TOOL_LABEL: Record<string, string> = {
  search_leads: "Buscou leads", get_lead: "Leu o lead", create_lead: "Criou lead", update_lead: "Atualizou lead",
  search_customers: "Buscou clientes", get_customer: "Leu cliente", create_customer: "Criou cliente", update_customer: "Atualizou cliente",
  search_vehicles: "Consultou estoque", get_vehicle: "Leu veículo", update_vehicle: "Alterou veículo",
  create_task: "Criou tarefa", update_task: "Alterou tarefa", complete_task: "Concluiu tarefa", search_tasks: "Buscou tarefas",
  create_appointment: "Agendou", search_appointments: "Consultou agenda", create_activity: "Registrou contato", search_activities: "Leu timeline",
  create_note: "Salvou nota", search_notes: "Buscou notas", search_proposals: "Buscou propostas", create_proposal: "Criou proposta",
  update_proposal: "Alterou proposta", who_to_call_today: "Priorizou contatos", save_memory: "Guardou memória",
};

const SUGGESTIONS = [
  "Quem eu preciso chamar hoje?",
  "Quais Onix tenho até 80 mil?",
  "SUV automático até 100 mil",
  "O que tenho na agenda hoje?",
  "Falei com João hoje, ele quer um Onix até 70 mil e pretende trocar em outubro",
  "Me lembra de falar com João amanhã às 10h",
];

/** Negrito **x** e quebras de linha; sem HTML arbitrário. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <p key={i} className={cn("min-h-[1em]", line.startsWith("- ") || line.startsWith("• ") ? "pl-3" : "")}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>,
          )}
        </p>
      ))}
    </>
  );
}

type SpeechRec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };

export function CopilotoChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [speechOk, setSpeechOk] = useState(false);

  useEffect(() => {
    setSpeechOk(typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window));
    fetch("/api/copiloto")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Erro");
        setMessages(j.messages ?? []);
        setConfigured(Boolean(j.configured));
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput("");
    setLoading(true);
    setMessages((m) => [...m, { role: "user", content: msg }, { role: "assistant", content: "", pending: true }]);
    try {
      const r = await fetch("/api/copiloto", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: msg }) });
      const j = await r.json().catch(() => ({ error: "Resposta inválida do servidor." }));
      setMessages((m) => [...m.slice(0, -1), r.ok ? j.message : { role: "assistant", content: j.error ?? "Erro ao falar com o Copiloto.", error: true }]);
    } catch {
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: "Sem conexão. Verifique a internet e tente de novo.", error: true }]);
    } finally {
      setLoading(false);
    }
  }

  function toggleMic() {
    if (listening) { recRef.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.onresult = (e) => setInput((prev) => `${prev ? prev + " " : ""}${e.results[0][0].transcript}`);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function clear() {
    await fetch("/api/copiloto", { method: "DELETE" });
    setMessages([]);
  }

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col md:h-[calc(100dvh-6rem)]">
      {!configured ? <div className="mb-3"><Alert kind="info">O Copiloto ainda não foi ativado: falta a chave da IA (ANTHROPIC_API_KEY) na Vercel. O resto do app funciona normalmente.</Alert></div> : null}
      {loadError ? <div className="mb-3"><Alert>{loadError}</Alert></div> : null}

      <div className="flex-1 space-y-3 overflow-y-auto pb-4" aria-live="polite">
        {!messages.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Sparkles className="h-10 w-10 text-brand" aria-hidden />
            <div>
              <h2 className="text-lg font-semibold">Pergunte qualquer coisa</h2>
              <p className="text-sm text-fg-muted">Consulto e registro direto no seu banco: leads, estoque, agenda e tarefas.</p>
            </div>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border bg-surface px-3 py-1.5 text-left text-sm hover:border-brand">{s}</button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={m.id ?? i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[88%] rounded-2xl px-4 py-2.5 text-sm",
                m.role === "user" ? "bg-brand text-white" : m.error ? "border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" : "border border-border bg-surface")}>
                {m.pending ? <span className="inline-flex items-center gap-2 text-fg-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-brand" />Consultando…</span> : <Rich text={m.content} />}
                {m.meta?.actions?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1 border-t border-border pt-2">
                    {m.meta.actions.map((a, j) => (
                      <span key={j} title={a.summary} className={cn("rounded-full px-2 py-0.5 text-[11px]",
                        a.status === "erro" ? "bg-red-100 text-red-800" : a.status === "pendente_confirmacao" ? "bg-amber-100 text-amber-800" : "bg-muted text-fg-muted")}>
                        {TOOL_LABEL[a.tool] ?? a.tool}{a.summary && a.summary !== "ok" ? ` · ${a.summary}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form className="flex items-end gap-2 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        {messages.length ? <Button type="button" variant="ghost" size="icon" aria-label="Limpar conversa" title="Limpar conversa" onClick={clear}><Trash2 className="h-4 w-4" /></Button> : null}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          rows={1}
          placeholder="Ex.: Falei com a Maria, quer SUV até 120 mil…"
          aria-label="Mensagem para o Copiloto"
          className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {speechOk ? (
          <Button type="button" variant={listening ? "danger" : "outline"} size="icon" aria-label={listening ? "Parar de ouvir" : "Falar"} onClick={toggleMic}><Mic className="h-4 w-4" /></Button>
        ) : null}
        <Button type="submit" size="icon" aria-label="Enviar" disabled={loading || !input.trim()}><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
