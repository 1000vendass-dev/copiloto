import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { AppointmentForm, AppointmentList } from "@/features/routine/components/appointment-ui";
import { openLeadOptions } from "@/features/routine/lead-options";
import { listAppointments } from "@/features/routine/queries";
import { addDays, dayRangeSP, isValidYmd, labelDay, todaySP, weekStart, ymdOf } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ d?: string; modo?: string; lead?: string }> }) {
  const sp = await searchParams;
  const today = todaySP();
  const day = isValidYmd(sp.d) ? sp.d : today;
  const mode = sp.modo === "semana" ? "semana" : "dia";
  const first = mode === "semana" ? weekStart(day) : day;
  const days = mode === "semana" ? Array.from({ length: 7 }, (_, i) => addDays(first, i)) : [day];
  const range = { start: dayRangeSP(days[0]).start, end: dayRangeSP(days[days.length - 1]).end };
  const [{ appointments, error }, leads] = await Promise.all([listAppointments(range.start, range.end), openLeadOptions()]);
  const step = mode === "semana" ? 7 : 1;
  const link = (d: string, m = mode) => `/agenda?d=${d}&modo=${m}`;

  return (
    <>
      <PageHeader title="Agenda" subtitle={mode === "semana" ? `Semana de ${labelDay(days[0])}` : labelDay(day)} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={link(addDays(day, -step))}><Button variant="outline" size="icon" aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></Button></Link>
        <Link href={link(today)}><Button variant="outline">Hoje</Button></Link>
        <Link href={link(addDays(day, step))}><Button variant="outline" size="icon" aria-label="Próximo"><ChevronRight className="h-4 w-4" /></Button></Link>
        <div className="ml-auto flex rounded-lg border border-border p-0.5">
          {(["dia", "semana"] as const).map((m) => (
            <Link key={m} href={link(day, m)} className={cn("rounded-md px-3 py-1 text-sm", mode === m ? "bg-brand text-white" : "text-fg-muted")}>{m === "dia" ? "Dia" : "Semana"}</Link>
          ))}
        </div>
      </div>
      {error ? <Alert>Não foi possível carregar a agenda.</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {days.map((d) => {
            const items = appointments.filter((a) => ymdOf(a.starts_at) === d);
            if (mode === "semana" && !items.length) {
              return <div key={d} className="flex items-center justify-between rounded-lg px-1 text-sm text-fg-muted"><Link href={link(d, "dia")} className={cn("font-medium hover:underline", d === today && "text-brand")}>{labelDay(d)}</Link><span>livre</span></div>;
            }
            return (
              <section key={d}>
                {mode === "semana" ? <h2 className={cn("mb-2 text-sm font-semibold", d === today && "text-brand")}><Link href={link(d, "dia")} className="hover:underline">{labelDay(d)}</Link></h2> : null}
                <AppointmentList items={items} leads={leads} />
              </section>
            );
          })}
        </div>
        <Card className="h-fit"><h2 className="mb-3 font-semibold">Novo compromisso</h2><AppointmentForm leads={leads} defaultDate={day} defaultLeadId={sp.lead} /></Card>
      </div>
    </>
  );
}
