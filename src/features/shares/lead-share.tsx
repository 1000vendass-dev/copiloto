"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Copy, Eye, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { VehiclePicker } from "@/features/inventory/vehicle-picker";
import { sendWhatsApp } from "@/features/whatsapp/actions";
import { cn, formatBRL } from "@/lib/utils";
import { createShare, type ShareResult } from "./actions";

type Vehicle = { id: string; label: string; price: number | null };

const toNum = (s: string) => {
  if (!s.trim()) return null;
  const n = Number(s.replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function waLink(phone: string | null | undefined, text: string) {
  const d = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${d ? (d.length <= 11 ? "55" + d : d) : ""}?text=${encodeURIComponent(text)}`;
}

/**
 * "Ficha técnica" no card do lead: escolhe o carro, ajusta o preço e gera o link da ficha já ligado ao lead.
 * O envio é sempre um toque do vendedor (pelo WhatsApp do Copiloto ou pelo app do WhatsApp).
 */
export function LeadSharePanel({ leadId, initial, canSend }: { leadId: string; initial: Vehicle | null; canSend: boolean }) {
  const router = useRouter();
  const [vehicle, setVehicle] = useState<Vehicle | null>(initial);
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : "");
  const [showPrice, setShowPrice] = useState(true);
  const [message, setMessage] = useState("");
  const [days, setDays] = useState("15");
  const [result, setResult] = useState<ShareResult | null>(null);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const base = vehicle?.price ?? null;
  const p = toNum(price);
  const diff = p !== null && base ? p - base : 0;

  const generate = () => start(async () => {
    setError(null);
    if (!vehicle) { setError("Escolha o veículo."); return; }
    const r = await createShare({ vehicleId: vehicle.id, leadId, price: p, showPrice, message: message || null, days: Number(days) });
    if (!r.ok) { setError(r.error ?? "Não foi possível gerar o link."); return; }
    setResult(r);
    setText(r.text ?? r.url ?? "");
  });

  const sendHere = () => start(async () => {
    setError(null);
    const r = await sendWhatsApp(leadId, text);
    if (!r.ok) { setError(r.error ?? "Não foi possível enviar."); return; }
    setSent(true);
    router.refresh();
  });

  if (result?.ok && result.url) {
    return (
      <div className="space-y-3">
        {sent ? <Alert kind="success">Ficha enviada. A mensagem já aparece na conversa.</Alert> : <Alert kind="success">Link da ficha pronto. Confira a mensagem e envie.</Alert>}
        {error ? <Alert>{error}</Alert> : null}
        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={pending || sent} aria-label="Mensagem com a ficha" />
        {!sent && canSend ? (
          <Button className="w-full" size="lg" onClick={sendHere} disabled={pending || !text.trim()}><Send className="h-4 w-4" />{pending ? "Enviando…" : "Enviar pelo WhatsApp do Copiloto"}</Button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <a href={waLink(result.phone, text)} target="_blank" rel="noopener noreferrer"><Button variant="outline" className="w-full"><MessageCircle className="h-4 w-4" />App WhatsApp</Button></a>
          <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(result.url!); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sem permissão */ } }}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copiado" : "Copiar link"}
          </Button>
        </div>
        <a href={result.url} target="_blank" rel="noopener noreferrer" className="block"><Button variant="ghost" className="w-full"><Eye className="h-4 w-4" />Ver como o cliente vê</Button></a>
        <Button variant="ghost" className="w-full" onClick={() => { setResult(null); setSent(false); }}>Gerar outra ficha</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Veículo" htmlFor="ls-vehicle">
        <VehiclePicker name="vehicle_id" initial={initial} onChange={(v) => {
          setVehicle(v ? { id: v.id, label: v.label, price: v.price ?? null } : null);
          setPrice(v?.price ? String(v.price) : "");
        }} />
      </Field>
      <Field label="Preço para este cliente" htmlFor="ls-price">
        <Input id="ls-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço do estoque" />
      </Field>
      {base && p !== null ? (
        <p className={cn("text-sm font-medium", diff > 0 ? "text-green-700" : diff < 0 ? "text-amber-700" : "text-fg-muted")}>
          Estoque {formatBRL(base)} · {diff > 0 ? `gordura +${formatBRL(diff)}` : diff < 0 ? `abaixo ${formatBRL(diff)}` : "mesmo preço"}
        </p>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Mostrar preço na ficha
      </label>
      <Field label="Recado na ficha (opcional)" htmlFor="ls-msg">
        <Textarea id="ls-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Aceitamos seu carro na troca, financiamento em até 60x." />
      </Field>
      <Field label="Link válido por" htmlFor="ls-days">
        <Select id="ls-days" value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="3">3 dias</option><option value="7">7 dias</option><option value="15">15 dias</option><option value="30">30 dias</option>
        </Select>
      </Field>
      <Button className="w-full" size="lg" onClick={generate} disabled={pending || !vehicle}>{pending ? "Gerando…" : "Gerar ficha"}</Button>
    </div>
  );
}
