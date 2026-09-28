import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Pencil, Phone } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  ContactForm, ConvertToCustomerButton, CustomerLink, DeleteLeadButton, FollowUpForm, NoteForm, NoteList,
  StageControl, TagEditor, TaskList, TemperatureControl,
} from "@/features/crm/components/lead-controls";
import { Timeline } from "@/features/crm/components/timeline";
import { getLead } from "@/features/crm/queries";
import { statusLabel } from "@/features/inventory/constants";
import { getSession } from "@/lib/auth";
import { formatBRL, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Lead" };

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.length <= 11 ? "55" + digits : digits}`;
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [session, data] = await Promise.all([getSession(), getLead(id)]);
  if (!data) notFound();
  const { lead, activities, notes, tasks, tags, allTags, customer, vehicle } = data;

  const info: [string, React.ReactNode][] = [
    ["Interesse", lead.interest],
    ["Orçamento máx.", lead.budget_max ? formatBRL(lead.budget_max) : null],
    ["Pagamento", lead.payment_method],
    ["Troca", lead.trade_in],
    ["Prazo de compra", lead.purchase_timeframe],
    ["Origem", lead.source],
    ["E-mail", lead.email],
    ["Último contato", lead.last_contact_at ? formatDateTime(lead.last_contact_at) : null],
    ["Próxima ação", lead.next_action ? `${lead.next_action}${lead.next_action_at ? " · " + formatDateTime(lead.next_action_at) : ""}` : null],
    ["Motivo da perda", lead.stage === "perdido" ? lead.lost_reason : null],
  ];

  return (
    <>
      <PageHeader
        title={lead.name}
        subtitle={lead.phone ?? undefined}
        actions={
          <>
            {lead.phone ? (
              <>
                <a href={`tel:${lead.phone.replace(/\s/g, "")}`}><Button variant="outline" size="icon" aria-label="Ligar"><Phone className="h-4 w-4" /></Button></a>
                <a href={waLink(lead.phone)} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="icon" aria-label="WhatsApp"><MessageCircle className="h-4 w-4" /></Button></a>
              </>
            ) : null}
            <Link href={`/leads/${lead.id}/editar`}><Button variant="outline"><Pencil className="h-4 w-4" />Editar</Button></Link>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Card className="space-y-3">
            <CardTitle>Negociação</CardTitle>
            <StageControl key={lead.stage} leadId={lead.id} stage={lead.stage} />
            <TemperatureControl leadId={lead.id} value={lead.temperature} />
            <dl className="space-y-2 text-sm">
              {info.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-fg-muted">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </Card>

          <Card className="space-y-2">
            <CardTitle>Veículo de interesse</CardTitle>
            {vehicle ? (
              <Link href={`/estoque/${vehicle.id}`} className="block text-sm hover:underline">
                {vehicle.brand} {vehicle.model} {vehicle.version} {vehicle.year_model}
                <div className="text-fg-muted">{formatBRL(vehicle.sale_price)} · {statusLabel(vehicle.status)}</div>
              </Link>
            ) : (
              <p className="text-sm text-fg-muted">Nenhum vinculado. Use “Editar” para escolher do estoque.</p>
            )}
          </Card>

          <Card className="space-y-2">
            <CardTitle>Cliente</CardTitle>
            {customer ? <CustomerLink id={customer.id} name={customer.name} /> : <ConvertToCustomerButton leadId={lead.id} />}
          </Card>

          <Card className="space-y-2">
            <CardTitle>Tags</CardTitle>
            <TagEditor target="lead" targetId={lead.id} tags={tags} allTags={allTags} />
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card><CardTitle className="mb-3">Registrar contato</CardTitle><ContactForm leadId={lead.id} customerId={lead.customer_id ?? undefined} /></Card>
          <Card>
            <CardTitle className="mb-3">Follow-ups e tarefas</CardTitle>
            <TaskList tasks={tasks} />
            <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-brand">+ Novo follow-up</summary>
              <div className="mt-3"><FollowUpForm leadId={lead.id} customerId={lead.customer_id ?? undefined} /></div>
            </details>
          </Card>
          <Card>
            <CardTitle className="mb-3">Notas</CardTitle>
            <NoteForm leadId={lead.id} customerId={lead.customer_id ?? undefined} />
            <NoteList notes={notes} userId={session.userId} />
          </Card>
          <Card><CardTitle className="mb-4">Timeline</CardTitle><Timeline items={activities} /></Card>
          <div className="flex justify-end"><DeleteLeadButton leadId={lead.id} /></div>
        </div>
      </div>
    </>
  );
}
