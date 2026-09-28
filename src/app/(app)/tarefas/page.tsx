import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, Card } from "@/components/ui/card";
import { TaskForm, TaskRows } from "@/features/routine/components/task-ui";
import { openLeadOptions } from "@/features/routine/lead-options";
import { listTasks, taskCounts } from "@/features/routine/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tarefas" };

const VIEWS = [
  { value: "atrasadas", label: "Atrasadas" }, { value: "hoje", label: "Hoje" }, { value: "futuras", label: "Futuras" },
  { value: "sem_data", label: "Sem data" }, { value: "concluidas", label: "Concluídas" },
] as const;
type View = (typeof VIEWS)[number]["value"];

export default async function TarefasPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const counts = await taskCounts();
  const fallback: View = counts.atrasadas ? "atrasadas" : "hoje";
  const view = (VIEWS.some((v) => v.value === sp.view) ? sp.view : fallback) as View;
  const [{ tasks, error }, leads] = await Promise.all([listTasks(view), openLeadOptions()]);

  return (
    <>
      <PageHeader title="Tarefas" />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {VIEWS.map((v) => {
          const n = v.value === "concluidas" ? null : counts[v.value];
          return (
            <Link key={v.value} href={`/tarefas?view=${v.value}`}
              className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium",
                view === v.value ? "border-brand bg-brand text-white" : "border-border bg-surface text-fg-muted",
                v.value === "atrasadas" && n && view !== v.value ? "border-red-300 text-red-700" : "")}>
              {v.label}{n ? ` (${n})` : ""}
            </Link>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {error ? <Alert>Não foi possível carregar as tarefas.</Alert> : <TaskRows tasks={tasks} leads={leads} />}
        </div>
        <Card className="h-fit"><h2 className="mb-3 font-semibold">Nova tarefa</h2><TaskForm leads={leads} /></Card>
      </div>
    </>
  );
}
