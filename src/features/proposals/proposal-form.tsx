"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { VehiclePicker } from "@/features/inventory/vehicle-picker";
import { useFormAction } from "@/lib/use-form-action";
import { cn, formatBRL } from "@/lib/utils";
import { saveProposal } from "./actions";

export type ProposalData = {
  id: string; lead_id: string | null; vehicle_id: string | null; vehicle_price: number | null; discount: number; down_payment: number;
  trade_in_description: string | null; trade_in_value: number; financed_amount: number; installments: number | null;
  installment_value: number | null; valid_until: string | null; notes: string | null;
};

const toNum = (v: string) => {
  const n = Number(v.replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function ProposalForm({ leads, proposal, defaultLeadId, vehicleInitial }: {
  leads: { id: string; name: string }[]; proposal?: ProposalData; defaultLeadId?: string;
  vehicleInitial?: { id: string; label: string; price: number | null } | null;
}) {
  const [state, onSubmit, pending] = useFormAction(saveProposal);
  const [v, setV] = useState({
    price: String(proposal?.vehicle_price ?? vehicleInitial?.price ?? ""), discount: String(proposal?.discount ?? ""),
    down: String(proposal?.down_payment ?? ""), trade: String(proposal?.trade_in_value ?? ""), financed: String(proposal?.financed_amount ?? ""),
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const total = toNum(v.price) - toNum(v.discount);
  const covered = toNum(v.down) + toNum(v.trade) + toNum(v.financed);
  const diff = total - covered;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {proposal ? <input type="hidden" name="id" value={proposal.id} /> : null}
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.ok ? <Alert kind="success">Proposta salva.</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lead *" htmlFor="lead_id">
          <Select id="lead_id" name="lead_id" defaultValue={proposal?.lead_id ?? defaultLeadId ?? ""} required>
            <option value="">— escolha —</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field label="Veículo *" htmlFor="vehicle"><VehiclePicker name="vehicle_id" initial={vehicleInitial ?? null} /></Field>
        <Field label="Preço do veículo (R$)" htmlFor="vehicle_price" hint="Vazio = preço do estoque">
          <Input id="vehicle_price" name="vehicle_price" inputMode="decimal" value={v.price} onChange={set("price")} />
        </Field>
        <Field label="Desconto (R$)" htmlFor="discount"><Input id="discount" name="discount" inputMode="decimal" value={v.discount} onChange={set("discount")} /></Field>
        <Field label="Entrada (R$)" htmlFor="down_payment"><Input id="down_payment" name="down_payment" inputMode="decimal" value={v.down} onChange={set("down")} /></Field>
        <Field label="Financiado (R$)" htmlFor="financed_amount"><Input id="financed_amount" name="financed_amount" inputMode="decimal" value={v.financed} onChange={set("financed")} /></Field>
        <Field label="Veículo na troca" htmlFor="trade_in_description"><Input id="trade_in_description" name="trade_in_description" defaultValue={proposal?.trade_in_description ?? ""} placeholder="Gol 2012 prata" /></Field>
        <Field label="Valor da troca (R$)" htmlFor="trade_in_value"><Input id="trade_in_value" name="trade_in_value" inputMode="decimal" value={v.trade} onChange={set("trade")} /></Field>
        <Field label="Parcelas" htmlFor="installments"><Input id="installments" name="installments" inputMode="numeric" defaultValue={proposal?.installments ?? ""} placeholder="48" /></Field>
        <Field label="Valor da parcela (R$)" htmlFor="installment_value"><Input id="installment_value" name="installment_value" inputMode="decimal" defaultValue={proposal?.installment_value ?? ""} /></Field>
        <Field label="Válida até" htmlFor="valid_until"><Input id="valid_until" name="valid_until" type="date" defaultValue={proposal?.valid_until ?? ""} /></Field>
      </div>
      <div className="rounded-xl bg-muted p-4 text-sm">
        <div className="flex justify-between"><span>Total da proposta</span><strong className="tabular-nums">{formatBRL(total)}</strong></div>
        <div className="flex justify-between text-fg-muted"><span>Entrada + troca + financiado</span><span className="tabular-nums">{formatBRL(covered)}</span></div>
        {covered > 0 ? (
          <div className={cn("flex justify-between font-medium", Math.abs(diff) < 1 ? "text-green-700" : "text-amber-700")}>
            <span>{Math.abs(diff) < 1 ? "Fechado ✓" : diff > 0 ? "Falta cobrir" : "Excede o total em"}</span>
            <span className="tabular-nums">{Math.abs(diff) < 1 ? "" : formatBRL(Math.abs(diff))}</span>
          </div>
        ) : null}
      </div>
      <Field label="Observações" htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={proposal?.notes ?? ""} /></Field>
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Salvando…" : proposal ? "Salvar proposta" : "Criar proposta"}</Button>
    </form>
  );
}
