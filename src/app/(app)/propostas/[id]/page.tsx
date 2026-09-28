import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { ProposalControls } from "@/features/proposals/proposal-controls";
import { ProposalForm } from "@/features/proposals/proposal-form";
import { PROPOSAL_STATUS, getProposal, vehicleLabel } from "@/features/proposals/queries";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Proposta" };

export default async function PropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const p = await getProposal(id);
  if (!p) notFound();
  const supabase = await createClient();
  const { data: leads } = await supabase.from("leads").select("id,name").order("name").limit(1000);
  const st = PROPOSAL_STATUS.find((s) => s.value === p.status);
  const lines: [string, string | null][] = [
    ["Veículo", vehicleLabel(p.vehicles)], ["Preço", formatBRL(p.vehicle_price)], ["Desconto", p.discount ? formatBRL(p.discount) : null],
    ["Entrada", p.down_payment ? formatBRL(p.down_payment) : null],
    ["Troca", p.trade_in_value ? `${p.trade_in_description ?? "veículo"} · ${formatBRL(p.trade_in_value)}` : null],
    ["Financiado", p.financed_amount ? formatBRL(p.financed_amount) : null],
    ["Parcelas", p.installments ? `${p.installments}x de ${formatBRL(p.installment_value)}` : null],
    ["Válida até", p.valid_until ? formatDate(`${p.valid_until}T12:00:00Z`) : null],
  ];
  return (
    <>
      <PageHeader title={`Proposta · ${p.leads?.name ?? ""}`} subtitle={`Criada em ${formatDate(p.created_at)}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-2xl font-bold tabular-nums">{formatBRL(p.total)}</span>{st ? <Badge className={st.className}>{st.label}</Badge> : null}</div>
            <dl className="space-y-1 text-sm">{lines.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-fg-muted">{k}</dt><dd className="text-right">{v}</dd></div>)}</dl>
            <div className="flex gap-3 text-sm">
              {p.lead_id ? <Link href={`/leads/${p.lead_id}`} className="text-brand hover:underline">Ver lead</Link> : null}
              {p.vehicle_id ? <Link href={`/estoque/${p.vehicle_id}`} className="text-brand hover:underline">Ver veículo</Link> : null}
            </div>
          </Card>
          <Card><CardTitle className="mb-3">Andamento</CardTitle><ProposalControls key={p.status} id={p.id} status={p.status} /></Card>
        </div>
        {p.status !== "aceita" ? (
          <Card className="lg:col-span-2"><CardTitle className="mb-3">Editar</CardTitle>
            <ProposalForm leads={leads ?? []} proposal={p} vehicleInitial={p.vehicles ? { id: p.vehicles.id, label: vehicleLabel(p.vehicles), price: p.vehicles.sale_price } : null} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
