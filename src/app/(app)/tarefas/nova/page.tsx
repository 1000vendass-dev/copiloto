import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { NewTaskForm } from "@/features/routine/components/task-ui";
import { openLeadOptions } from "@/features/routine/lead-options";

export const metadata: Metadata = { title: "Nova tarefa" };

export default async function NovaTarefaPage() {
  const leads = await openLeadOptions();
  return (
    <>
      <PageHeader title="Nova tarefa" />
      <Card><NewTaskForm leads={leads} /></Card>
    </>
  );
}
