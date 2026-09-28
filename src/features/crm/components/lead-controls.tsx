"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { cn, formatDateTime } from "@/lib/utils";
import type { Tag, Task } from "@/types/db";
import {
  addNote, changeLeadStage, convertLeadToCustomer, createFollowUp, deleteLead, deleteNote,
  registerContact, setLeadTemperature, setTaskStatus, toggleTag, type ActionResult,
} from "../actions";
import { CONTACT_TYPES, STAGES, TEMPERATURES } from "../constants";

/* ------------------------------ etapa ------------------------------ */
export function StageControl({ leadId, stage }: { leadId: string; stage: string }) {
  const [value, setValue] = useState(stage);
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (next: string, lost?: string) =>
    start(async () => {
      setError(null);
      const r = await changeLeadStage(leadId, next, lost);
      if (!r.ok) { setError(r.error ?? "Erro"); setValue(stage); } else setAskReason(false);
    });

  return (
    <div className="space-y-2">
      <Select
        aria-label="Etapa do funil"
        value={value}
        disabled={pending}
        onChange={(e) => {
          setValue(e.target.value);
          if (e.target.value === "perdido") setAskReason(true);
          else save(e.target.value);
        }}
      >
        {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </Select>
      {askReason ? (
        <div className="flex gap-2">
          <Input placeholder="Motivo da perda (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button type="button" onClick={() => save("perdido", reason)} disabled={pending}>Salvar</Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

/* --------------------------- temperatura --------------------------- */
export function TemperatureControl({ leadId, value }: { leadId: string; value: string | null }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1" role="group" aria-label="Temperatura">
      {TEMPERATURES.map((t) => (
        <button
          key={t.value}
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await setLeadTemperature(leadId, value === t.value ? null : t.value); })}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-opacity",
            t.className,
            value === t.value ? "ring-2 ring-offset-1 ring-current" : "opacity-50 hover:opacity-100",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------- formulários curtos ------------------------- */
function useResetOnSuccess(state: ActionResult | undefined) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return ref;
}

type Target = { leadId?: string; customerId?: string };
function TargetInputs({ leadId, customerId }: Target) {
  return (
    <>
      {leadId ? <input type="hidden" name="lead_id" value={leadId} /> : null}
      {customerId ? <input type="hidden" name="customer_id" value={customerId} /> : null}
    </>
  );
}

export function ContactForm(target: Target) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(registerContact, undefined);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <TargetInputs {...target} />
      {state?.error ? <Alert>{state.error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="c-type">
          <Select id="c-type" name="type" defaultValue="whatsapp">
            {CONTACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Quando" htmlFor="c-when" hint="Vazio = agora">
          <Input id="c-when" name="occurred_at" type="datetime-local" />
        </Field>
      </div>
      <Field label="O que foi conversado" htmlFor="c-desc">
        <Textarea id="c-desc" name="description" placeholder="Cliente quer um Onix até 80 mil, troca em outubro…" />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Registrar contato"}</Button>
      {state?.ok ? <span className="ml-2 text-sm text-green-700">Registrado ✓</span> : null}
    </form>
  );
}

export function NoteForm(target: Target) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(addNote, undefined);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <TargetInputs {...target} />
      {state?.error ? <Alert>{state.error}</Alert> : null}
      <Textarea name="content" aria-label="Nova nota" placeholder="Ex.: usa o carro para trabalhar, tem urgência" required />
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Salvando…" : "Adicionar nota"}</Button>
    </form>
  );
}

export function FollowUpForm(target: Target) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(createFollowUp, undefined);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <TargetInputs {...target} />
      {state?.error ? <Alert>{state.error}</Alert> : null}
      <Field label="Tarefa" htmlFor="f-title">
        <Input id="f-title" name="title" placeholder="Retornar sobre o financiamento" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quando" htmlFor="f-due">
          <Input id="f-due" name="due_at" type="datetime-local" />
        </Field>
        <Field label="Prioridade" htmlFor="f-prio">
          <Select id="f-prio" name="priority" defaultValue="media">
            <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
          </Select>
        </Field>
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Criar follow-up"}</Button>
      {state?.ok ? <span className="ml-2 text-sm text-green-700">Criado ✓</span> : null}
    </form>
  );
}

/* ------------------------------ tarefas ------------------------------ */
export function TaskList({ tasks }: { tasks: Task[] }) {
  const [pending, start] = useTransition();
  if (!tasks.length) return <EmptyState>Nenhuma tarefa.</EmptyState>;
  const now = new Date().toISOString();
  return (
    <ul className="divide-y divide-border">
      {tasks.map((t) => {
        const done = t.status === "concluida";
        const late = !done && t.due_at && t.due_at < now;
        return (
          <li key={t.id} className="flex items-start gap-3 py-2">
            <button
              type="button"
              aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
              disabled={pending}
              onClick={() => start(async () => { await setTaskStatus(t.id, done ? "pendente" : "concluida"); })}
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                done ? "border-green-600 bg-green-600 text-white" : "border-border hover:border-brand",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : null}
            </button>
            <div className="min-w-0">
              <div className={cn("text-sm", done && "text-fg-muted line-through")}>{t.title}</div>
              <div className={cn("text-xs", late ? "font-medium text-red-600" : "text-fg-muted")}>
                {t.due_at ? formatDateTime(t.due_at) : "sem data"}{late ? " · atrasada" : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------- notas ------------------------------- */
export function NoteList({ notes, userId }: { notes: { id: string; content: string; created_at: string; owner_id: string | null }[]; userId: string }) {
  if (!notes.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {notes.map((n) => (
        <li key={n.id} className="rounded-lg bg-muted p-3 text-sm">
          <p className="whitespace-pre-line">{n.content}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-fg-muted">
            <span>{formatDateTime(n.created_at)}</span>
            {n.owner_id === userId ? <ConfirmButton label="Excluir" confirmLabel="Excluir nota" size="sm" variant="ghost" onConfirm={() => deleteNote(n.id)} /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------- tags -------------------------------- */
export function TagEditor({ target, targetId, tags, allTags }: { target: "lead" | "customer"; targetId: string; tags: Tag[]; allTags: Tag[] }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const active = new Set(tags.map((t) => t.id));
  const toggle = (n: string) => start(async () => { await toggleTag(target, targetId, n); setName(""); });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {allTags.map((t) => (
          <button key={t.id} type="button" disabled={pending} onClick={() => toggle(t.name)}>
            <Badge className={active.has(t.id) ? "bg-brand text-white" : "bg-muted text-fg-muted"}>{t.name}</Badge>
          </button>
        ))}
        {!allTags.length ? <span className="text-xs text-fg-muted">Nenhuma tag ainda.</span> : null}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) toggle(name); }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova tag" className="h-9" />
        <Button type="submit" size="sm" variant="outline" disabled={pending} aria-label="Adicionar tag"><Plus className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}

/* ------------------------ cliente / exclusão ------------------------ */
export function ConvertToCustomerButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={pending}
        onClick={() => start(async () => {
          const r = await convertLeadToCustomer(leadId);
          if (r.ok && r.id) router.push(`/clientes/${r.id}`); else setError(r.error ?? "Erro");
        })}>
        {pending ? "Criando…" : "Criar cadastro de cliente"}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </>
  );
}

export function DeleteLeadButton({ leadId }: { leadId: string }) {
  return <ConfirmButton label="Excluir lead" confirmLabel="Excluir lead e histórico" onConfirm={() => deleteLead(leadId)} />;
}

export function CustomerLink({ id, name }: { id: string; name: string }) {
  return <Link href={`/clientes/${id}`} className="text-brand hover:underline">{name}</Link>;
}
