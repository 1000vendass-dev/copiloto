"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { Customer } from "@/types/db";
import { createCustomer, deleteCustomer, updateCustomer, type ActionResult } from "../actions";

export function CustomerForm({ customer }: { customer?: Customer }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(customer ? updateCustomer : createCustomer, undefined);
  return (
    <form action={action} className="space-y-4">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.ok ? <Alert kind="success">Cliente salvo.</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome *" htmlFor="name"><Input id="name" name="name" defaultValue={customer?.name} required /></Field>
        <Field label="Telefone / WhatsApp" htmlFor="phone"><Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={customer?.phone ?? ""} /></Field>
        <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} /></Field>
        <Field label="Cidade" htmlFor="city"><Input id="city" name="city" defaultValue={customer?.city ?? ""} /></Field>
        <Field label="CPF / CNPJ" htmlFor="document"><Input id="document" name="document" inputMode="numeric" defaultValue={customer?.document ?? ""} /></Field>
      </div>
      <Field label="Observações" htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={customer?.notes ?? ""} /></Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : customer ? "Salvar" : "Cadastrar cliente"}</Button>
        {customer ? <ConfirmButton label="Excluir cliente" confirmLabel="Excluir cliente e histórico" onConfirm={() => deleteCustomer(customer.id)} /> : null}
      </div>
    </form>
  );
}
