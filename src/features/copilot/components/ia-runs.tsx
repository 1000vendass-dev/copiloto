"use client";

import { useState, useTransition } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardTitle, EmptyState } from "@/components/ui/card";
import { cn, formatDateTime } from "@/lib/utils";
import { runNightlyNow } from "../actions";

export type RunRow = { id: string; job: string; status: string; trigger: string; started_at: string; finished_at: string | null; error: string | null; stats: Record<string, number | boolean> | null };

const STATUS: Record<string, { label: string; cls: string }> = {
  rodando: { label: "Rodando…", cls: "bg-brand/15 text-brand" },
  ok: { label: "Concluída", cls: "bg-green-500/15 text-green-700 dark:text-green-400" },
  parcial: { label: "Parcial", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  erro: { label: "Erro", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

function summary(s: RunRow["stats"]): string {
  if (!s) return "";
  const n = (k: string) => Number(s[k] ?? 0);
  const parts = [
    n("processed") ? `${n("processed")} clientes` : "",
    n("tasksCreated") + n("tasksUpdated") ? `${n("tasksCreated") + n("tasksUpdated")} tarefas` : "",
    n("memoriesAdded") ? `${n("memoriesAdded")} fatos` : "",
    n("namesFilled") ? `${n("namesFilled")} nomes` : "",
    n("errors") ? `${n("errors")} erros` : "",
    n("seconds") ? `${Math.round(n("seconds") / 60 * 10) / 10} min` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

/** Últimas execuções da IA e o botão "Rodar agora". O Realtime atualiza a lista sozinho. */
export function IaRuns({ runs }: { runs: RunRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const running = runs.some((r) => r.status === "rodando");

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>Atividade</CardTitle>
        <Button size="sm" onClick={() => start(async () => { const r = await runNightlyNow(); setError(r.ok ? null : r.error ?? "Erro"); })} disabled={pending || running}>
          <Play className="h-3.5 w-3.5" />{running ? "Rodando…" : "Rodar agora"}
        </Button>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {runs.length ? (
        <ul className="divide-y divide-border">
          {runs.map((r) => {
            const st = STATUS[r.status] ?? STATUS.erro;
            return (
              <li key={r.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Rotina da noite{r.trigger === "manual" ? " (manual)" : ""}</span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", st.cls)}>{st.label}</span>
                </div>
                <div className="text-xs text-fg-muted">{formatDateTime(r.started_at)}{summary(r.stats) ? ` · ${summary(r.stats)}` : ""}</div>
                {r.error ? <div className="text-xs text-red-600">{r.error}</div> : null}
              </li>
            );
          })}
        </ul>
      ) : <EmptyState>Nenhuma execução ainda. Toque em “Rodar agora” para ver a IA trabalhando.</EmptyState>}
    </Card>
  );
}
