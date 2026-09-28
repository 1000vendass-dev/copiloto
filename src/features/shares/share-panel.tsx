"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Eye, MessageCircle, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { cn, formatBRL, formatDateTime } from "@/lib/utils";
import { createShare, revokeShare, type ShareResult } from "./actions";

export type ShareRow = {
  id: string; token: string; price: number | null; show_price: boolean; message: string | null; views: number;
  last_viewed_at: string | null; expires_at: string; revoked: boolean; created_at: string; lead_id: string | null;
  leads: { name: string; phone: string | null } | null;
};

type Mode = "valor" | "pct";

const toNum = (s: string) => {
  if (!s.trim()) return null;
  const n = Number(s.replace(/[R$%\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const round10 = (n: number) => Math.round(n / 10) * 10;

function waLink(phone: string | null | undefined, text: string) {
  const d = (phone ?? "").replace(/\D/g, "");
  const num = d ? (d.length <= 11 ? "55" + d : d) : "";
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

function shareText(title: string, url: string, leadName?: string | null, price?: number | null) {
  const first = leadName ? leadName.split(" ")[0] : "";
  const preco = price ? ` por ${formatBRL(price)}` : "";
  return `${first ? `Olá, ${first}! ` : "Olá! "}Separei as fotos e a ficha completa do ${title}${preco} para você: ${url}`;
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function SharePanel({ vehicleId, vehicleTitle, basePrice, leads, shares, origin }: {
  vehicleId: string; vehicleTitle: string; basePrice: number | null; leads: { id: string; name: string }[]; shares: ShareRow[]; origin: string;
}) {
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [mode, setMode] = useState<Mode>("valor");
  const [markup, setMarkup] = useState("");
  const [price, setPrice] = useState(basePrice ? String(basePrice) : "");
  const [showPrice, setShowPrice] = useState(true);
  const [message, setMessage] = useState("");
  const [days, setDays] = useState("15");
  const [result, setResult] = useState<ShareResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const p = toNum(price);
  const diff = p !== null && basePrice ? p - basePrice : 0;

  /** Recalcula o preço final a partir da gordura digitada (R$ ou %). */
  function applyMarkup(raw: string, m: Mode = mode) {
    setMarkup(raw);
    const v = toNum(raw);
    if (!basePrice) return;
    if (v === null) { setPrice(String(basePrice)); return; }
    setPrice(String(m === "pct" ? round10(basePrice * (1 + v / 100)) : Math.round(basePrice + v)));
  }
  function switchMode(m: Mode) { setMode(m); applyMarkup(markup, m); }

  function reset(prefill?: ShareRow) {
    setResult(null); setLeadId(""); setMode("valor");
    if (prefill) {
      const pr = prefill.price != null ? Number(prefill.price) : basePrice;
      setPrice(pr ? String(pr) : "");
      setMarkup(pr && basePrice && pr !== basePrice ? String(pr - basePrice) : "");
      setShowPrice(prefill.show_price); setMessage(prefill.message ?? "");
    } else {
      setPrice(basePrice ? String(basePrice) : ""); setMarkup(""); setShowPrice(true); setMessage("");
    }
    setOpen(true);
  }

  function submit() {
    start(async () => {
      const r = await createShare({ vehicleId, leadId: leadId || null, price: p, showPrice, message: message || null, days: Number(days) });
      setResult(r);
    });
  }

  if (!open) {
    return (
      <div className="space-y-3">
        <Button className="w-full" size="lg" onClick={() => reset()}><Share2 className="h-4 w-4" />Enviar ficha para cliente</Button>
        <ShareHistory shares={shares} origin={origin} vehicleTitle={vehicleTitle} onReuse={reset} />
      </div>
    );
  }

  if (result?.ok && result.url) {
    return (
      <div className="space-y-3">
        <Alert kind="success">Link pronto{result.leadName ? ` para ${result.leadName}` : ""}. Ele fica salvo em "Fichas enviadas" para reenviar quando quiser.</Alert>
        <div className="break-all rounded-lg bg-muted p-2 text-xs">{result.url}</div>
        <a href={waLink(result.phone, result.text ?? result.url)} target="_blank" rel="noopener noreferrer" className="block">
          <Button className="w-full bg-green-600 hover:bg-green-700" size="lg"><MessageCircle className="h-4 w-4" />Enviar no WhatsApp</Button>
        </a>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={async () => { if (await copyText(result.url!)) { setCopied(true); setTimeout(() => setCopied(false), 2000); } }}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copiar link
          </Button>
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

      {basePrice ? (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium">Gordura</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs" role="group" aria-label="Tipo de gordura">
              {(["valor", "pct"] as const).map((m) => (
                <button key={m} type="button" onClick={() => switchMode(m)} aria-pressed={mode === m}
                  className={cn("px-3 py-1.5 font-medium", mode === m ? "bg-brand text-white" : "text-fg-muted hover:bg-muted")}>
                  {m === "valor" ? "R$" : "%"}
                </button>
              ))}
            </div>
          </div>
          <Input id="sh-markup" inputMode="decimal" value={markup} onChange={(e) => applyMarkup(e.target.value)}
            placeholder={mode === "valor" ? "Ex.: 2000" : "Ex.: 5"} aria-label={mode === "valor" ? "Gordura em reais" : "Gordura em porcentagem"} />
          <p className="mt-1 text-xs text-fg-muted">Estoque: {formatBRL(basePrice)}</p>
        </div>
      ) : null}

      <Field label="Preço final para este cliente" htmlFor="sh-price">
        <Input id="sh-price" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setMarkup(""); }} />
      </Field>
      {basePrice && p !== null ? (
        <p className={cn("text-sm font-medium", diff > 0 ? "text-green-700" : diff < 0 ? "text-amber-700" : "text-fg-muted")}>
          {diff > 0 ? `Cliente vê ${formatBRL(p)} · gordura +${formatBRL(diff)} (${((diff / basePrice) * 100).toFixed(1).replace(".", ",")}%)`
            : diff < 0 ? `Abaixo do estoque: ${formatBRL(diff)}` : "Mesmo preço do estoque"}
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

function ShareHistory({ shares, origin, vehicleTitle, onReuse }: {
  shares: ShareRow[]; origin: string; vehicleTitle: string; onReuse: (s: ShareRow) => void;
}) {
  const [pending, start] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  if (!shares.length) return null;
  const now = new Date().toISOString();
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase text-fg-muted">Fichas enviadas</h3>
      <ul className="divide-y divide-border text-sm">
        {shares.map((s) => {
          const active = !s.revoked && s.expires_at > now;
          const url = `${origin}/v/${s.token}`;
          const text = shareText(vehicleTitle, url, s.leads?.name, s.show_price ? s.price : null);
          return (
            <li key={s.id} className="space-y-2 py-2.5">
              <div className="min-w-0">
                <div className="truncate font-medium">{s.leads?.name ?? "Sem cliente"} · {s.show_price ? formatBRL(s.price) : "sem preço"}</div>
                <div className="text-xs text-fg-muted">
                  {s.views ? `aberta ${s.views}x · última ${formatDateTime(s.last_viewed_at)}` : "ainda não aberta"} · {active ? `válida até ${formatDateTime(s.expires_at)}` : s.revoked ? "desativada" : "vencida"}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {active ? (
                  <>
                    <a href={waLink(s.leads?.phone, text)} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700">
                      <MessageCircle className="h-3.5 w-3.5" />WhatsApp
                    </a>
                    <button type="button" onClick={async () => { if (await copyText(url)) { setCopiedId(s.id); setTimeout(() => setCopiedId(null), 2000); } }}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
                      {copiedId === s.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copiedId === s.id ? "Copiado" : "Copiar link"}
                    </button>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
                      <Eye className="h-3.5 w-3.5" />Abrir
                    </a>
                  </>
                ) : null}
                <button type="button" onClick={() => onReuse(s)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
                  <RefreshCw className="h-3.5 w-3.5" />Usar para outro cliente
                </button>
                {active ? (
                  <button type="button" disabled={pending} onClick={() => start(async () => { await revokeShare(s.id); })} className="rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-muted">Desativar</button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
