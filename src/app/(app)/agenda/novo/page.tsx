import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { NewAppointmentForm } from "@/features/routine/components/appointment-ui";
import { openLeadOptions } from "@/features/routine/lead-options";
import { isValidYmd, todaySP } from "@/lib/dates";

export const metadata: Metadata = { title: "Novo compromisso" };

export default async function NovoCompromissoPage({ searchParams }: { searchParams: Promise<{ d?: string; lead?: string }> }) {
  const sp = await searchParams;
  const day = isValidYmd(sp.d) ? sp.d : todaySP();
  const leads = await openLeadOptions();
  return (
    <>
      <PageHeader title="Novo compromisso" />
      <Card><NewAppointmentForm leads={leads} defaultDate={day} defaultLeadId={sp.lead} /></Card>
    </>
  );
}
