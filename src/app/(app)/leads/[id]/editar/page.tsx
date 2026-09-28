import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { LeadForm } from "@/features/crm/components/lead-form";
import { getLead } from "@/features/crm/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Editar lead" };

export default async function EditarLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getLead(id);
  if (!data) notFound();
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id,name").order("name").limit(1000);
  const v = data.vehicle;
  const vehicleLabel = v ? `${v.stock_code ? v.stock_code + " · " : ""}${v.brand} ${v.model} ${v.version ?? ""} ${v.year_model ?? ""}`.trim() : null;
  return (
    <>
      <PageHeader title={`Editar: ${data.lead.name}`} actions={<Link href={`/leads/${id}`} className="text-sm text-brand hover:underline">Voltar</Link>} />
      <Card><LeadForm lead={data.lead} customers={customers ?? []} vehicleLabel={vehicleLabel} /></Card>
    </>
  );
}
