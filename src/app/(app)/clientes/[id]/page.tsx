import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, EmptyState } from "@/components/ui/card";
import { CustomerForm } from "@/features/crm/components/customer-form";
import { LeadCard } from "@/features/crm/components/lead-card";
import { ContactForm, FollowUpForm, NoteForm, NoteList, TagEditor, TaskList } from "@/features/crm/components/lead-controls";
import { Timeline } from "@/features/crm/components/timeline";
import { getCustomer } from "@/features/crm/queries";
import { getSession } from "@/lib/auth";
import { formatBRL, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Cliente" };

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [session, data] = await Promise.all([getSession(), getCustomer(id)]);
  if (!data) notFound();
  const { customer, leads, timeline, notes, tasks, appointments, proposals, tags, allTags } = data;

  return (
    <>
      <PageHeader title={customer.name} subtitle={customer.phone ?? undefined}
        actions={<Link href={`/leads/novo?cliente=${customer.id}`}><Button variant="outline"><Plus className="h-4 w-4" />Nova negociação</Button></Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card><CardTitle className="mb-3">Negociações</CardTitle>
            {leads.length ? <div className="space-y-2">{leads.map((l) => <LeadCard key={l.id} lead={l} />)}</div> : <EmptyState>Nenhuma negociação.</EmptyState>}
          </Card>
          <Card><CardTitle className="mb-3">Compromissos</CardTitle>
            {appointments.length ? (
              <ul className="space-y-1 text-sm">{appointments.map((a) => <li key={a.id}>{formatDateTime(a.starts_at)} · {a.title} <span className="text-fg-muted">({a.status})</span></li>)}</ul>
            ) : <EmptyState>Nenhum compromisso.</EmptyState>}
          </Card>
          <Card><CardTitle className="mb-3">Propostas</CardTitle>
            {proposals.length ? (
              <ul className="space-y-1 text-sm">{proposals.map((p) => <li key={p.id}>{formatDateTime(p.created_at)} · {formatBRL(p.total)} <span className="text-fg-muted">({p.status})</span></li>)}</ul>
            ) : <EmptyState>Nenhuma proposta.</EmptyState>}
          </Card>
          <Card className="space-y-2"><CardTitle>Tags</CardTitle><TagEditor target="customer" targetId={customer.id} tags={tags} allTags={allTags} /></Card>
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Card><CardTitle className="mb-3">Registrar contato</CardTitle><ContactForm customerId={customer.id} /></Card>
          <Card><CardTitle className="mb-3">Tarefas</CardTitle><TaskList tasks={tasks} />
            <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-brand">+ Nova tarefa</summary>
              <div className="mt-3"><FollowUpForm customerId={customer.id} /></div></details>
          </Card>
          <Card><CardTitle className="mb-3">Notas</CardTitle><NoteForm customerId={customer.id} /><NoteList notes={notes} userId={session.userId} /></Card>
          <Card><CardTitle className="mb-4">Timeline completa</CardTitle><Timeline items={timeline} /></Card>
          <Card><CardTitle className="mb-3">Dados do cliente</CardTitle><CustomerForm customer={customer} /></Card>
        </div>
      </div>
    </>
  );
}
