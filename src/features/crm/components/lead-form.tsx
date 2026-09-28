"use client";

import { useFormAction } from "@/lib/use-form-action";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { VehiclePicker } from "@/features/inventory/vehicle-picker";
import type { Lead } from "@/types/db";
import { createLead, updateLead, type ActionResult } from "../actions";
import { SOURCES, STAGES, TEMPERATURES } from "../constants";

/** ISO → valor de <input type="datetime-local"> no fuso de São Paulo */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

export function LeadForm({
  lead,
  customers,
  vehicleLabel,
  defaultCustomerId,
}: {
  lead?: Lead;
  customers: { id: string; name: string }[];
  vehicleLabel?: string | null;
  defaultCustomerId?: string;
}) {
  const [state, onSubmit, pending] = useFormAction(lead ? updateLead : createLead);

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {lead ? <input type="hidden" name="id" value={lead.id} /> : null}
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.ok ? <Alert kind="success">Lead salvo.</Alert> : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-fg-muted">Contato</legend>
        <Field label="Nome *" htmlFor="name">
          <Input id="name" name="name" defaultValue={lead?.name} required autoFocus={!lead} />
        </Field>
        <Field label="Telefone / WhatsApp" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={lead?.phone ?? ""} />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={lead?.email ?? ""} />
        </Field>
        <Field label="Origem" htmlFor="source">
          <Input id="source" name="source" list="sources" defaultValue={lead?.source ?? ""} />
          <datalist id="sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Cliente vinculado" htmlFor="customer_id">
          <Select id="customer_id" name="customer_id" defaultValue={lead?.customer_id ?? defaultCustomerId ?? ""}>
            <option value="">— nenhum —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-fg-muted">Interesse</legend>
        <Field label="O que procura" htmlFor="interest" hint="Ex.: Onix automático, SUV até 2020">
          <Input id="interest" name="interest" defaultValue={lead?.interest ?? ""} />
        </Field>
        <Field label="Orçamento máximo (R$)" htmlFor="budget_max">
          <Input id="budget_max" name="budget_max" inputMode="decimal" defaultValue={lead?.budget_max ?? ""} placeholder="70.000" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Veículo de interesse (estoque)" htmlFor="vehicle">
            <VehiclePicker name="vehicle_id" initial={lead?.vehicle_id && vehicleLabel ? { id: lead.vehicle_id, label: vehicleLabel } : null} />
          </Field>
        </div>
        <Field label="Forma de pagamento" htmlFor="payment_method">
          <Input id="payment_method" name="payment_method" list="payments" defaultValue={lead?.payment_method ?? ""} />
          <datalist id="payments">
            {["À vista", "Financiamento", "Consórcio", "Troca + financiamento", "Troca + à vista"].map((s) => <option key={s} value={s} />)}
          </datalist>
        </Field>
        <Field label="Veículo na troca" htmlFor="trade_in">
          <Input id="trade_in" name="trade_in" defaultValue={lead?.trade_in ?? ""} />
        </Field>
        <Field label="Prazo de compra" htmlFor="purchase_timeframe" hint="Ex.: outubro, 30 dias">
          <Input id="purchase_timeframe" name="purchase_timeframe" defaultValue={lead?.purchase_timeframe ?? ""} />
        </Field>
        <Field label="Temperatura" htmlFor="temperature">
          <Select id="temperature" name="temperature" defaultValue={lead?.temperature ?? ""}>
            <option value="">—</option>
            {TEMPERATURES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        {!lead ? (
          <Field label="Etapa" htmlFor="stage">
            <Select id="stage" name="stage" defaultValue="novo">
              {STAGES.filter((s) => s.value !== "venda" && s.value !== "perdido").map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-fg-muted">Próxima ação</legend>
        <Field label="O que fazer" htmlFor="next_action">
          <Input id="next_action" name="next_action" defaultValue={lead?.next_action ?? ""} placeholder="Ligar para apresentar o Onix" />
        </Field>
        <Field label="Quando" htmlFor="next_action_at">
          <Input id="next_action_at" name="next_action_at" type="datetime-local" defaultValue={toLocalInput(lead?.next_action_at)} />
        </Field>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Salvando…" : lead ? "Salvar alterações" : "Criar lead"}</Button>
      </div>
    </form>
  );
}

