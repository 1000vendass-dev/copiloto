"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Eye, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { cn, formatBRL, formatDateTime } from "@/lib/utils";
import { createShare, revokeShare, type ShareResult } from "./actions";

export type ShareRow = { id: string; token: string; price: number | null; show_price: boolean; views: number; last_viewed_at: string | null; expires_at: string; revoked: boolean; created_at: string; leads: { name: string } | null };

const toNum = (s: string) => {
  const n = Number(s.replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function waLink(phone: string | null | undefined, text: string) {
  const d = (phone ?? "").replace(/\D/g, "");
  const num = d ? (d.length <= 11 ? "55" + d : d) : "";
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

export function SharePanel({ vehicleId, basePrice, leads, shares, origin }: {
  vehicleId: string; basePrice: number | null; leads: { id: string; name: string }[]; shares: ShareRow[]; origin: string;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(basePrice ? String(basePrice) : "");
  const [leadId, setLeadId] = useState("");
  const [showPrice, setShowPrice] = useState(true);
  const [message, setMessage] = useState("");
  const [days, setDays] = useState("15");
  const [result, setResult] = useState<ShareResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const p = toNum(price);
  const markup = p !== null && basePrice ? p - basePrice : 0;
  const bump = (v: number) => setPrice(String(Math.round(((p ?? basePrice ?? 0) + v))));

  function submit() {
    start(async () => {
      const r = await createShare({ vehicleId, leadId: leadId || null, price: p, showPrice, message: message || null, days: Number(days) });
      setResult(r);
    });
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sem permissão */ }
  }

  if (!open) {
    return (
      <div className="space-y-3">
        <Button className="w-full" size="lg" onClick={() => { setOpen(true); setResult(null); }}><Share2 className="h-4 w-4" />Enviar ficha para cliente</Button>
        <ShareHistory shares={shares} origin={origin} />
      </div>
    );
  }

  if (result?.ok && result.url) {
    return (
      <div className="space-y-3">
        <Alert kind="success">Link pronto{result.leadName ? ` para ${result.leadName}` : ""}. Registrado na timeline.</Alert>
        <div className="break-all rounded-lg bg-muted p-2 text-xs">{result.url}</div>
        <a href={waLink(result.phone, result.text ?? result.url)} target="_blank" rel="noopener noreferrer" className="block">
          <Button className="w-full bg-green-600 hover:bg-green-700" size="lg"><MessageCircle className="h-4 w-4" />Enviar no WhatsApp</Button>
        </a>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => copy(result.url!)}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copiar link</Button>
          <a href={result.url} target="_blank" rel="noopener noreferrer"><Button variant="outline" className="w-full"><Eye className="h-4 w-4" />Ver como cliente</Button></a>
        </div>
        <Button variant="ghost" className="w-full" onClick={() => { setOpen(false); setResult(null); }}>Fechar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {result?.error ? <Alert>{result.error}</Alert> : null}
      <Field label="Cliente (opcional)" htmlFor="sh-lead" hint="Vincula ao lead e registra na timeline">
        <Select id="sh-lead" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
          <option value="">— sem vincular —</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </Field>
      <Field label="Preço para este cliente" htmlFor="sh-price" hint={basePrice ? `Estoque: ${formatBRL(basePrice)}` : undefined}>
        <Input id="sh-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {[1000, 2000, 3000, 5000].map((v) => (
          <button key={v} type="button" onClick={() => bump(v)} className="rounded-full border border-border px-3 py-1 text-xs hover:border-brand">+{v / 1000} mil</button>
        ))}
        <button type="button" onClick={() => setPrice(basePrice ? String(basePrice) : "")} className="rounded-full border border-border px-3 py-1 text-xs text-fg-muted hover:border-brand">Voltar ao preço</button>
      </div>
      {basePrice && p !== null ? (
        <p className={cn("text-sm font-medium", markup > 0 ? "text-green-700" : markup < 0 ? "text-amber-700" : "text-fg-muted")}>
          {markup > 0 ? `Gordura: +${formatBRL(markup)}` : markup < 0 ? `Abaixo do estoque: ${formatBRL(markup)}` : "Mesmo preço do estoque"}
        </p>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Mostrar preço na ficha
      </label>
      <Field label="Recado para o cliente (opcional)" htmlFor="sh-msg">
        <Textarea id="sh-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Aceitamos seu Gol na troca, financiamento em até 60x." />
      </Field>
      <Field label="Link válido por" htmlFor="sh-days">
        <Select id="sh-days" value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="3">3 dias</option><option value="7">7 dias</option><option value="15">15 dias</option><option value="30">30 dias</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button onClick={submit} disabled={pending}>{pending ? "Gerando…" : "Gerar link"}</Button>
      </div>
    </div>
  );
}

function ShareHistory({ shares, origin }: { shares: ShareRow[]; origin: string }) {
  const [pending, start] = useTransition();
  if (!shares.length) return null;
  const now = new Date().toISOString();
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase text-fg-muted">Fichas enviadas</h3>
      <ul className="divide-y divide-border text-sm">
        {shares.map((s) => {
          const active = !s.revoked && s.expires_at > now;
          return (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="truncate">{s.leads?.name ?? "Sem cliente"} · {s.show_price ? formatBRL(s.price) : "sem preço"}</div>
                <div className="text-xs text-fg-muted">
                  {s.views ? `aberta ${s.views}x · última ${formatDateTime(s.last_viewed_at)}` : "ainda não aberta"} · {active ? `até ${formatDateTime(s.expires_at)}` : "desativada"}
                </div>
              </div>
              {active ? (
                <div className="flex shrink-0 gap-1">
                  <a href={`${origin}/v/${s.token}`} target="_blank" rel="noopener noreferrer" className="rounded p-1.5 text-fg-muted hover:bg-muted" aria-label="Abrir"><Eye className="h-4 w-4" /></a>
                  <button type="button" disabled={pending} onClick={() => start(async () => { await revokeShare(s.id); })} className="rounded px-2 text-xs text-red-600 hover:bg-muted">Desativar</button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
