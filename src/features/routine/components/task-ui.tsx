"use client";

import { useFormAction } from "@/lib/use-form-action";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toLocalInput } from "@/features/crm/components/lead-form";
import { setTaskStatus } from "@/features/crm/actions";
import { cn, formatDateTime } from "@/lib/utils";
import { deleteTask, saveTask, type ActionResult } from "../actions";
import type { TaskRow } from "../queries";

export type LeadOption = { id: string; name: string };

export function TaskForm({ leads, task, onDone }: { leads: LeadOption[]; task?: TaskRow; onDone?: () => void }) {
  const [state, onSubmit, pending] = useFormAction(saveTask);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) { if (!task) ref.current?.reset(); onDone?.(); } }, [state, task, onDone]);
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3">
      {task ? <input type="hidden" name="id" value={task.id} /> : null}
      {state?.error ? <Alert>{state.error}</Alert> : null}
      <Field label="Tarefa" htmlFor={`t-title-${task?.id ?? "new"}`}>
        <Input id={`t-title-${task?.id ?? "new"}`} name="title" defaultValue={task?.title} required placeholder="Ligar para o João" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quando" htmlFor={`t-due-${task?.id ?? "new"}`}>
          <Input id={`t-due-${task?.id ?? "new"}`} name="due_at" type="datetime-local" defaultValue={toLocalInput(task?.due_at)} />
        </Field>
        <Field label="Prioridade" htmlFor={`t-prio-${task?.id ?? "new"}`}>
          <Select id={`t-prio-${task?.id ?? "new"}`} name="priority" defaultValue={task?.priority ?? "media"}>
            <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
          </Select>
        </Field>
      </div>
      <Field label="Lead (opcional)" htmlFor={`t-lead-${task?.id ?? "new"}`}>
        <Select id={`t-lead-${task?.id ?? "new"}`} name="lead_id" defaultValue={task?.lead_id ?? ""}>
          <option value="">— nenhum —</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </Field>
      <Field label="Detalhes" htmlFor={`t-desc-${task?.id ?? "new"}`}>
        <Textarea id={`t-desc-${task?.id ?? "new"}`} name="description" defaultValue={task?.description ?? ""} rows={2} />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Salvando…" : task ? "Salvar" : "Criar tarefa"}</Button>
    </form>
  );
}

const PRIO = { alta: "border-l-red-500", media: "border-l-amber-400", baixa: "border-l-slate-300" } as Record<string, string>;

export function TaskRows({ tasks, leads }: { tasks: TaskRow[]; leads: LeadOption[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!tasks.length) return <EmptyState>Nenhuma tarefa aqui.</EmptyState>;
  const now = new Date().toISOString();
  return (
    <>
      {error ? <Alert>{error}</Alert> : null}
      <ul className="space-y-2">
        {tasks.map((t) => {
          const done = t.status === "concluida";
          const late = !done && t.due_at && t.due_at < now;
          return (
            <li key={t.id} className={cn("rounded-xl border border-l-4 border-border bg-surface p-3", PRIO[t.priority])}>
              {editing === t.id ? (
                <TaskForm leads={leads} task={t} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex items-start gap-3">
                  <button type="button" aria-label={done ? "Reabrir" : "Concluir"} disabled={pending}
                    onClick={() => start(async () => { const r = await setTaskStatus(t.id, done ? "pendente" : "concluida"); if (!r.ok) setError(r.error ?? "Erro"); })}
                    className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
                      done ? "border-green-600 bg-green-600 text-white" : "border-border hover:border-brand")}>
                    {done ? <Check className="h-4 w-4" /> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={cn("font-medium", done && "text-fg-muted line-through")}>{t.title}</div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-fg-muted">
                      <span className={cn(late && "font-medium text-red-600")}>{t.due_at ? formatDateTime(t.due_at) : "sem data"}{late ? " · atrasada" : ""}</span>
                      {t.lead_id && t.leads ? <Link href={`/leads/${t.lead_id}`} className="text-brand hover:underline">{t.leads.name}</Link> : null}
                      {!t.lead_id && t.customer_id && t.customers ? <Link href={`/clientes/${t.customer_id}`} className="text-brand hover:underline">{t.customers.name}</Link> : null}
                    </div>
                    {t.description ? <p className="mt-1 text-sm text-fg-muted">{t.description}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!done ? <Button type="button" variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditing(t.id)}><Pencil className="h-4 w-4" /></Button> : null}
                    <ConfirmButton label="Excluir" confirmLabel="Excluir" variant="ghost" onConfirm={() => deleteTask(t.id)} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
