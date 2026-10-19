import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { TaskRows } from "@/features/routine/components/task-ui";
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
      <PageHeader title="Tarefas" actions={<Link href="/tarefas/nova"><Button><Plus className="h-4 w-4" />Nova tarefa</Button></Link>} />
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
      {error ? <Alert>Não foi possível carregar as tarefas.</Alert> : <TaskRows tasks={tasks} leads={leads} />}
    </>
  );
}
