import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { LeadForm } from "@/features/crm/components/lead-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Novo lead" };

export default async function NovoLeadPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await searchParams;
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id,name").order("name").limit(1000);
  return (
    <>
      <PageHeader title="Novo lead" />
      <Card><LeadForm customers={customers ?? []} defaultCustomerId={cliente} /></Card>
    </>
  );
}
