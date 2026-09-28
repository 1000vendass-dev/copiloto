"use client";

import { useFormAction } from "@/lib/use-form-action";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { updateProfile, updateTeamName, type FormState } from "./actions";

export function ProfileForm({ fullName, phone, email }: { fullName: string; phone: string; email: string }) {
  const [state, onSubmit, pending] = useFormAction(updateProfile);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.success ? <Alert kind="success">{state.success}</Alert> : null}
      <Field label="E-mail" htmlFor="email">
        <Input id="email" value={email} disabled readOnly />
      </Field>
      <Field label="Nome" htmlFor="full_name">
        <Input id="full_name" name="full_name" defaultValue={fullName} required />
      </Field>
      <Field label="Telefone" htmlFor="phone">
        <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={phone} />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
    </form>
  );
}

export function TeamForm({ name, canEdit }: { name: string; canEdit: boolean }) {
  const [state, onSubmit, pending] = useFormAction(updateTeamName);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.success ? <Alert kind="success">{state.success}</Alert> : null}
      <Field label="Nome da equipe / loja" htmlFor="name">
        <Input id="name" name="name" defaultValue={name} disabled={!canEdit} required />
      </Field>
      {canEdit ? <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button> : null}
    </form>
  );
}
