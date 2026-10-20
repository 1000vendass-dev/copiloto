"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardTitle, EmptyState } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { addMemory, setMemoryStatus } from "../actions";

export type MemoryRow = { id: string; scope: string; content: string; status: string; source: string; lead_name?: string | null };

const SCOPES = [
  { value: "loja", label: "Loja" }, { value: "vendedor", label: "Sobre mim" }, { value: "preferencia", label: "Preferência" }, { value: "padrao", label: "Padrão de vendas" },
] as const;
const LABEL: Record<string, string> = { loja: "Loja", vendedor: "Sobre mim", preferencia: "Preferência", padrao: "Padrão", geral: "Geral", cliente: "Cliente", lead: "Cliente", veiculo: "Veículo" };
const SOURCE: Record<string, string> = { voce: "você", rotina: "rotina da IA", chat: "conversa" };

/** O que a IA sabe sobre a loja e sobre você. Aprove o que ela sugeriu, arquive o que não vale mais, ou escreva você mesmo. */
export function IaMemory({ items, clientCount }: { items: MemoryRow[]; clientCount: number }) {
  const [scope, setScope] = useState<string>("loja");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); setError(r.ok ? null : r.error ?? "Erro"); });
  const suggested = items.filter((m) => m.status === "sugerida");
  const active = items.filter((m) => m.status === "ativa");

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Memória da IA</CardTitle>
        <p className="mt-1 text-xs text-fg-muted">
          O que ela sabe sobre a loja e sobre você entra em toda conversa. O que ela aprende de cada cliente ({clientCount} fatos guardados) aparece no card do lead.
        </p>
      </div>
      {error ? <Alert>{error}</Alert> : null}

      {suggested.length ? (
        <div className="space-y-2">
          <div className="text-[13px] font-semibold text-amber-600 dark:text-amber-400">A IA sugeriu ({suggested.length}). Aprova?</div>
          {suggested.map((m) => (
            <div key={m.id} className="flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <span className="min-w-0 flex-1">{m.content}</span>
              <button type="button" aria-label="Aprovar" disabled={pending} onClick={() => act(() => setMemoryStatus(m.id, "ativa"))} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-600"><Check className="h-4 w-4" /></button>
              <button type="button" aria-label="Descartar" disabled={pending} onClick={() => act(() => setMemoryStatus(m.id, "arquivada"))} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-fg-muted"><Archive className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      ) : null}

      {active.length ? (
        <ul className="divide-y divide-border">
          {active.map((m) => (
            <li key={m.id} className="flex items-start gap-2 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                {m.content}
                <span className="mt-0.5 block text-[11px] text-fg-muted">{LABEL[m.scope] ?? m.scope} · {SOURCE[m.source] ?? m.source}</span>
              </span>
              <button type="button" aria-label="Arquivar" disabled={pending} onClick={() => act(() => setMemoryStatus(m.id, "arquivada"))} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-muted"><Archive className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      ) : <EmptyState>Ainda não há nada guardado sobre a loja e sobre você. Escreva abaixo o que a IA precisa saber.</EmptyState>}

      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; act(async () => { const r = await addMemory(scope, text); if (r.ok) setText(""); return r; }); }}>
        <Select aria-label="Tipo" value={scope} onChange={(e) => setScope(e.target.value)} className="w-40">
          {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Input aria-label="O que a IA deve saber" value={text} maxLength={500} placeholder="Ex.: A loja abre de segunda a sábado, das 8h às 18h" onChange={(e) => setText(e.target.value)} className="min-w-0 flex-1" />
        <Button type="submit" size="icon" aria-label="Guardar" disabled={pending || !text.trim()}><Plus className="h-4 w-4" /></Button>
      </form>
    </Card>
  );
}
