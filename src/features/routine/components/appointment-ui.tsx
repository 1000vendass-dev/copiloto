"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toLocalInput } from "@/features/crm/components/lead-form";
import { VehiclePicker } from "@/features/inventory/vehicle-picker";
import { formatTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteAppointment, saveAppointment, setAppointmentStatus, type ActionResult } from "../actions";
import type { AppointmentRow } from "../queries";
import type { LeadOption } from "./task-ui";

export const APPT_TYPES = [
  { value: "visita", label: "Visita" }, { value: "test_drive", label: "Test-drive" }, { value: "ligacao", label: "Ligação" },
  { value: "reuniao", label: "Reunião" }, { value: "entrega", label: "Entrega" }, { value: "outro", label: "Outro" },
] as const;
export const APPT_STATUS = [
  { value: "agendado", label: "Agendado" }, { value: "confirmado", label: "Confirmado" }, { value: "realizado", label: "Realizado" },
  { value: "cancelado", label: "Cancelado" }, { value: "nao_compareceu", label: "Não compareceu" },
] as const;

export function AppointmentForm({ leads, appt, defaultDate, defaultLeadId, onDone }: {
  leads: LeadOption[]; appt?: AppointmentRow; defaultDate?: string; defaultLeadId?: string; onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(saveAppointment, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) { if (!appt) ref.current?.reset(); onDone?.(); } }, [state, appt, onDone]);
  const k = appt?.id ?? "new";
  const vLabel = appt?.vehicles ? `${appt.vehicles.brand} ${appt.vehicles.model} ${appt.vehicles.year_model ?? ""}` : null;
  return (
    <form ref={ref} action={action} className="space-y-3">
      {appt ? <input type="hidden" name="id" value={appt.id} /> : null}
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.ok && !appt ? <Alert kind="success">Compromisso agendado.</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Título" htmlFor={`a-title-${k}`}><Input id={`a-title-${k}`} name="title" defaultValue={appt?.title} required placeholder="Visita do João" /></Field>
        <Field label="Tipo" htmlFor={`a-type-${k}`}>
          <Select id={`a-type-${k}`} name="type" defaultValue={appt?.type ?? "visita"}>{APPT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
        </Field>
        <Field label="Início" htmlFor={`a-start-${k}`}>
          <Input id={`a-start-${k}`} name="starts_at" type="datetime-local" required defaultValue={appt ? toLocalInput(appt.starts_at) : defaultDate ? `${defaultDate}T10:00` : ""} />
        </Field>
        <Field label="Término (opcional)" htmlFor={`a-end-${k}`}><Input id={`a-end-${k}`} name="ends_at" type="datetime-local" defaultValue={toLocalInput(appt?.ends_at)} /></Field>
        <Field label="Lead" htmlFor={`a-lead-${k}`}>
          <Select id={`a-lead-${k}`} name="lead_id" defaultValue={appt?.lead_id ?? defaultLeadId ?? ""}>
            <option value="">— nenhum —</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field label="Local" htmlFor={`a-loc-${k}`}><Input id={`a-loc-${k}`} name="location" defaultValue={appt?.location ?? ""} placeholder="Loja 1" /></Field>
        <div className="sm:col-span-2"><Field label="Veículo" htmlFor={`a-veh-${k}`}><VehiclePicker name="vehicle_id" initial={appt?.vehicle_id && vLabel ? { id: appt.vehicle_id, label: vLabel } : null} /></Field></div>
      </div>
      <Field label="Observações" htmlFor={`a-notes-${k}`}><Textarea id={`a-notes-${k}`} name="notes" defaultValue={appt?.notes ?? ""} rows={2} /></Field>
      <Button type="submit" disabled={pending}>{pending ? "Salvando…" : appt ? "Salvar" : "Agendar"}</Button>
    </form>
  );
}

const STATUS_STYLE: Record<string, string> = {
  agendado: "border-l-blue-500", confirmado: "border-l-green-500", realizado: "border-l-slate-400 opacity-70",
  cancelado: "border-l-red-400 opacity-60", nao_compareceu: "border-l-red-500 opacity-70",
};

export function AppointmentList({ items, leads }: { items: AppointmentRow[]; leads: LeadOption[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!items.length) return <EmptyState>Nenhum compromisso.</EmptyState>;
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.id} className={cn("rounded-xl border border-l-4 border-border bg-surface p-3", STATUS_STYLE[a.status])}>
          {editing === a.id ? (
            <>
              <AppointmentForm leads={leads} appt={a} onDone={() => setEditing(null)} />
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setEditing(null)}>Cancelar</Button>
            </>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold tabular-nums">{formatTime(a.starts_at)}{a.ends_at ? `–${formatTime(a.ends_at)}` : ""} · {APPT_TYPES.find((t) => t.value === a.type)?.label}</div>
                <div className="font-medium">{a.title}</div>
                <div className="flex flex-wrap gap-x-3 text-xs text-fg-muted">
                  {a.lead_id && a.leads ? <Link href={`/leads/${a.lead_id}`} className="text-brand hover:underline">{a.leads.name}</Link> : null}
                  {a.vehicle_id && a.vehicles ? <Link href={`/estoque/${a.vehicle_id}`} className="hover:underline">{a.vehicles.brand} {a.vehicles.model} {a.vehicles.year_model}</Link> : null}
                  {a.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{a.location}</span> : null}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Select aria-label="Status" className="h-9 w-40 text-sm" value={a.status} disabled={pending}
                  onChange={(e) => { const s = e.target.value; start(async () => { await setAppointmentStatus(a.id, s); }); }}>
                  {APPT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
                <Button variant="ghost" size="sm" onClick={() => setEditing(a.id)}>Editar</Button>
                <ConfirmButton label="Excluir" confirmLabel="Excluir" variant="ghost" onConfirm={() => deleteAppointment(a.id)} />
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
