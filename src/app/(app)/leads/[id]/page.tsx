import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import {
  ContactForm, ConvertToCustomerButton, CustomerLink, DeleteLeadButton, FollowUpForm, NoteForm, NoteList,
  StageControl, TagEditor, TaskList, TemperatureControl, VisitButton,
} from "@/features/crm/components/lead-controls";
import { LeadWorkspace } from "@/features/crm/components/lead-workspace";
import { Timeline } from "@/features/crm/components/timeline";
import { stageLabel } from "@/features/crm/constants";
import { getLead } from "@/features/crm/queries";
import { statusLabel } from "@/features/inventory/constants";
import { ContactTypeControl } from "@/features/whatsapp/contact-type-control";
import { getLeadWhatsApp } from "@/features/whatsapp/queries";
import { WhatsAppChat } from "@/features/whatsapp/whatsapp-chat";
import { LeadSharePanel } from "@/features/shares/lead-share";
import { getSession } from "@/lib/auth";
import { formatBRL, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Lead" };

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.length <= 11 ? "55" + digits : digits}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 border-b border-border pb-5 last:border-0 last:pb-0"><CardTitle>{title}</CardTitle>{children}</section>;
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [session, data, whatsapp] = await Promise.all([getSession(), getLead(id), getLeadWhatsApp(id)]);
  if (!data) notFound();
  const { lead, activities, notes, tasks, tags, allTags, customer, vehicle } = data;
  const target = { leadId: lead.id, customerId: lead.customer_id ?? undefined };

  const info: [string, React.ReactNode][] = [
    ["Telefone", lead.phone],
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

  const profile = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
        <VisitButton leadId={lead.id} />
        <Link href={`/propostas/nova?lead=${lead.id}`}><Button variant="outline" size="sm"><FileText className="h-4 w-4" />Proposta</Button></Link>
        <Link href={`/leads/${lead.id}/editar`}><Button variant="outline" size="sm"><Pencil className="h-4 w-4" />Editar</Button></Link>
        <div className="ml-auto"><DeleteLeadButton leadId={lead.id} /></div>
      </div>
      <Section title="Cliente">
        {customer ? <CustomerLink id={customer.id} name={customer.name} /> : <><p className="text-sm text-fg-muted">Ainda não cadastrado como cliente.</p><ConvertToCustomerButton leadId={lead.id} /></>}
      </Section>
      <Section title="Negociação">
        <StageControl key={lead.stage} leadId={lead.id} stage={lead.stage} />
        <TemperatureControl leadId={lead.id} value={lead.temperature} />
        {whatsapp.contactType
          ? <ContactTypeControl leadId={lead.id} value={whatsapp.contactType} />
          : <p className="text-xs text-fg-muted">Tipo de contato: cadastre o telefone (Editar) para ligar ao WhatsApp.</p>}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          {info.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-xs text-fg-muted">{k}</dt><dd className="break-words">{v}</dd></div>
          ))}
        </dl>
      </Section>
      <Section title="Veículo de interesse">
        {vehicle ? (
          <Link href={`/estoque/${vehicle.id}`} className="block text-sm hover:underline">
            {vehicle.brand} {vehicle.model} {vehicle.version} {vehicle.year_model}
            <div className="text-fg-muted">{formatBRL(vehicle.sale_price)} · {statusLabel(vehicle.status)}</div>
          </Link>
        ) : <p className="text-sm text-fg-muted">Nenhum vinculado. Use “Editar” para escolher do estoque.</p>}
      </Section>
      <Section title="Timeline"><Timeline items={activities} /></Section>
    </div>
  );

  return (
    <LeadWorkspace
      lead={{ id: lead.id, name: lead.name, subtitle: `${stageLabel(lead.stage)}${lead.phone ? " · " + lead.phone : ""}` }}
      telHref={lead.phone ? `tel:${lead.phone.replace(/\s/g, "")}` : null}
      waHref={lead.phone ? waLink(lead.phone) : null}
      chat={<WhatsAppChat leadId={lead.id} messages={whatsapp.messages} drafts={whatsapp.drafts} enabled={whatsapp.enabled} />}
      profile={profile}
      panels={{
        ficha: <LeadSharePanel leadId={lead.id} canSend={whatsapp.enabled && Boolean(lead.phone)} initial={vehicle && vehicle.status !== "vendido" ? { id: vehicle.id, label: `${vehicle.brand} ${vehicle.model} ${vehicle.version ?? ""} ${vehicle.year_model ?? ""}`.replace(/\s+/g, " ").trim(), price: vehicle.sale_price == null ? null : Number(vehicle.sale_price) } : null} />,
        notas: <div className="space-y-4"><NoteForm {...target} /><NoteList notes={notes} userId={session.userId} /></div>,
        tarefas: <div className="space-y-4"><TaskList tasks={tasks} /><div className="border-t border-border pt-4"><FollowUpForm {...target} /></div></div>,
        contato: <ContactForm {...target} />,
        tags: <TagEditor target="lead" targetId={lead.id} tags={tags} allTags={allTags} />,
      }}
    />
  );
}
