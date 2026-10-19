import Link from "next/link";
import { AlarmClock, CalendarDays, CheckSquare, ChevronRight, Flame, MessageCircle, Phone } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert, Card, CardTitle, EmptyState } from "@/components/ui/card";
import { stageLabel } from "@/features/crm/constants";
import { AppointmentList } from "@/features/routine/components/appointment-ui";
import { TaskRows } from "@/features/routine/components/task-ui";
import { openLeadOptions } from "@/features/routine/lead-options";
import { getCallList, listAppointments, listTasks } from "@/features/routine/queries";
import { getSession } from "@/lib/auth";
import { dayRangeSP, labelDay, todaySP } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

function waLink(phone: string) {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.length <= 11 ? "55" + d : d}`;
}

export default async function MeuDiaPage() {
  const session = await getSession();
  const today = todaySP();
  const { start, end } = dayRangeSP(today);
  const supabase = await createClient();

  const [late, todayTasks, appts, callList, leads, vehiclesCount] = await Promise.all([
    listTasks("atrasadas"),
    listTasks("hoje"),
    listAppointments(start, end),
    getCallList(12),
    openLeadOptions(),
    supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("status", "disponivel"),
  ]);
  const failed = [late.error, todayTasks.error, appts.error, vehiclesCount.error].some(Boolean);
  const in2h = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  const now = [...late.tasks, ...todayTasks.tasks.filter((t) => t.due_at && t.due_at <= in2h)].slice(0, 6);
  const activeAppts = appts.appointments.filter((a) => !["cancelado"].includes(a.status));
  const firstName = (session.fullName ?? session.email).split(" ")[0];

  return (
    <>
      <PageHeader title={`Olá, ${firstName}`} subtitle={`${labelDay(today)} · ${session.teamName}`} />
      {failed ? <div className="mb-4"><Alert>Parte das informações não carregou. Recarregue a página.</Alert></div> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat href="/tarefas?view=atrasadas" icon={AlarmClock} label="Atrasadas" value={late.tasks.length} tone={late.tasks.length > 0 ? "red" : "slate"} />
        <Stat href="/tarefas?view=hoje" icon={CheckSquare} label="Tarefas hoje" value={todayTasks.tasks.length} tone="blue" />
        <Stat href="/agenda" icon={CalendarDays} label="Compromissos" value={activeAppts.length} tone="violet" />
        <Stat href="/estoque" icon={Flame} label="Disponíveis" value={vehiclesCount.count ?? 0} tone="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="Agora" />
          {now.length ? <TaskRows tasks={now} leads={leads} /> : <EmptyState>Nada urgente agora. 👍</EmptyState>}
        </Card>

        <Card>
          <CardHead title="Quem chamar hoje" href="/leads" link="Leads" />
          {callList.length ? (
            <ul className="-mx-1 space-y-1">
              {callList.map(({ lead, reason }) => (
                <li key={lead.id} className="flex items-center gap-3 rounded-2xl px-1 py-1.5">
                  <Link href={`/leads/${lead.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={lead.name} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{lead.name}</span>
                      <span className="block truncate text-xs text-fg-muted">{stageLabel(lead.stage)} · {reason}</span>
                    </span>
                  </Link>
                  {lead.phone ? (
                    <div className="flex shrink-0 gap-1.5">
                      <a href={`tel:${lead.phone.replace(/\s/g, "")}`} aria-label={`Ligar para ${lead.name}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-fg hover:bg-muted-2"><Phone className="h-4 w-4" /></a>
                      <a href={waLink(lead.phone)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${lead.name}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15 text-green-600 hover:bg-green-500/25 dark:text-green-400"><MessageCircle className="h-4 w-4" /></a>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <EmptyState>Nenhum lead precisando de contato hoje.</EmptyState>}
        </Card>

        <Card>
          <CardHead title="Agenda de hoje" href="/agenda" link="Agenda" />
          <AppointmentList items={appts.appointments} leads={leads} />
        </Card>

        <Card>
          <CardHead title="Tarefas de hoje" href="/tarefas" link="Todas" />
          <TaskRows tasks={todayTasks.tasks} leads={leads} />
        </Card>

        {late.tasks.length > 6 ? (
          <Card className="lg:col-span-2">
            <CardTitle className="mb-3">Atrasados <Badge className="ml-2 bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">{late.tasks.length}</Badge></CardTitle>
            <TaskRows tasks={late.tasks.slice(6)} leads={leads} />
          </Card>
        ) : null}
      </div>
    </>
  );
}

function CardHead({ title, href, link }: { title: string; href?: string; link?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <CardTitle>{title}</CardTitle>
      {href ? (
        <Link href={href} className="inline-flex items-center gap-0.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/15">
          {link}<ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/12 text-sm font-bold text-brand" aria-hidden>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

const TONES = {
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  blue: "bg-brand/15 text-brand",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  slate: "bg-muted-2 text-fg-muted",
} as const;

function Stat({ href, icon: Icon, label, value, tone }: { href: string; icon: typeof Phone; label: string; value: number; tone: keyof typeof TONES }) {
  return (
    <Link href={href} className="glass flex items-center gap-3 rounded-3xl p-3.5 transition-transform active:scale-[0.98]">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${TONES[tone]}`}><Icon className="h-5 w-5" aria-hidden /></span>
      <span className="min-w-0">
        <span className={`block text-2xl font-bold leading-none tabular-nums ${tone === "red" ? "text-red-600 dark:text-red-400" : ""}`}>{value}</span>
        <span className="mt-1 block truncate text-xs text-fg-muted">{label}</span>
      </span>
    </Link>
  );
}
