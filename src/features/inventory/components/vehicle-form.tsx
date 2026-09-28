"use client";

import { useFormAction } from "@/lib/use-form-action";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { Vehicle } from "@/types/db";
import { createVehicle, updateVehicle, type ActionResult } from "../actions";
import { BODY_TYPES, FUELS, TRANSMISSIONS, VEHICLE_STATUS } from "../constants";

export function VehicleForm({ vehicle, features = [], stores = [] }: { vehicle?: Vehicle; features?: string[]; stores?: string[] }) {
  const [state, onSubmit, pending] = useFormAction(vehicle ? updateVehicle : createVehicle);
  const v = vehicle;
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {v ? <input type="hidden" name="id" value={v.id} /> : null}
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.ok ? <Alert kind="success">Veículo salvo.</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Marca *" htmlFor="brand"><Input id="brand" name="brand" defaultValue={v?.brand} required /></Field>
        <Field label="Modelo *" htmlFor="model"><Input id="model" name="model" defaultValue={v?.model} required /></Field>
        <Field label="Versão" htmlFor="version"><Input id="version" name="version" defaultValue={v?.version ?? ""} /></Field>
        <Field label="Ano fabricação" htmlFor="year_manufacture"><Input id="year_manufacture" name="year_manufacture" inputMode="numeric" defaultValue={v?.year_manufacture ?? ""} /></Field>
        <Field label="Ano modelo" htmlFor="year_model"><Input id="year_model" name="year_model" inputMode="numeric" defaultValue={v?.year_model ?? ""} /></Field>
        <Field label="Km" htmlFor="km"><Input id="km" name="km" inputMode="numeric" defaultValue={v?.km ?? ""} /></Field>
        <Field label="Preço de venda (R$)" htmlFor="sale_price"><Input id="sale_price" name="sale_price" inputMode="decimal" defaultValue={v?.sale_price ?? ""} /></Field>
        <Field label="Preço de compra (R$)" htmlFor="purchase_price" hint="Interno, não aparece para clientes"><Input id="purchase_price" name="purchase_price" inputMode="decimal" defaultValue={v?.purchase_price ?? ""} /></Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={v?.status ?? "disponivel"}>
            {VEHICLE_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Categoria" htmlFor="category">
          <Select id="category" name="category" defaultValue={v?.category ?? "carro"}>
            <option value="carro">Carro</option><option value="moto">Moto</option><option value="utilitario">Utilitário</option>
            <option value="caminhao">Caminhão</option><option value="outro">Outro</option>
          </Select>
        </Field>
        <Field label="Carroceria" htmlFor="body_type">
          <Select id="body_type" name="body_type" defaultValue={v?.body_type ?? ""}>
            <option value="">—</option>{BODY_TYPES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </Select>
        </Field>
        <Field label="Câmbio" htmlFor="transmission">
          <Select id="transmission" name="transmission" defaultValue={v?.transmission ?? ""}>
            <option value="">—</option>{TRANSMISSIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Combustível" htmlFor="fuel">
          <Select id="fuel" name="fuel" defaultValue={v?.fuel ?? ""}>
            <option value="">—</option>{FUELS.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </Field>
        <Field label="Motor" htmlFor="engine"><Input id="engine" name="engine" defaultValue={v?.engine ?? ""} placeholder="1.0 Turbo" /></Field>
        <Field label="Cor" htmlFor="color"><Input id="color" name="color" defaultValue={v?.color ?? ""} /></Field>
        <Field label="Portas" htmlFor="doors"><Input id="doors" name="doors" inputMode="numeric" defaultValue={v?.doors ?? ""} /></Field>
        <Field label="Placa" htmlFor="plate"><Input id="plate" name="plate" defaultValue={v?.plate ?? ""} autoCapitalize="characters" /></Field>
        <Field label="Código de estoque" htmlFor="stock_code"><Input id="stock_code" name="stock_code" defaultValue={v?.stock_code ?? ""} placeholder="V281" /></Field>
        <Field label="Loja" htmlFor="store">
          <Input id="store" name="store" list="stores" defaultValue={v?.store ?? ""} />
          <datalist id="stores">{stores.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
      </div>
      <Field label="Opcionais" htmlFor="features" hint="Um por linha ou separados por vírgula">
        <Textarea id="features" name="features" defaultValue={features.join("\n")} rows={5} />
      </Field>
      <Field label="Descrição / observações" htmlFor="description"><Textarea id="description" name="description" defaultValue={v?.description ?? ""} /></Field>
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Salvando…" : v ? "Salvar alterações" : "Cadastrar veículo"}</Button>
    </form>
  );
}
