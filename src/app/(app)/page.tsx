import Link from "next/link";
import { AlarmClock, CalendarDays, CheckSquare, Flame, MessageCircle, Phone } from "lucide-react";
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

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat href="/tarefas?view=atrasadas" icon={AlarmClock} label="Atrasadas" value={late.tasks.length} alert={late.tasks.length > 0} />
        <Stat href="/tarefas?view=hoje" icon={CheckSquare} label="Tarefas hoje" value={todayTasks.tasks.length} />
        <Stat href="/agenda" icon={CalendarDays} label="Compromissos hoje" value={activeAppts.length} />
        <Stat href="/estoque" icon={Flame} label="Veículos disponíveis" value={vehiclesCount.count ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Agora</CardTitle>
          {now.length ? <TaskRows tasks={now} leads={leads} /> : <EmptyState>Nada urgente agora. 👍</EmptyState>}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <CardTitle>Quem chamar hoje</CardTitle>
            <Link href="/leads" className="text-sm text-brand hover:underline">Ver leads</Link>
          </div>
          {callList.length ? (
            <ul className="divide-y divide-border">
              {callList.map(({ lead, reason }) => (
                <li key={lead.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/leads/${lead.id}`} className="min-w-0">
                    <div className="truncate font-medium">{lead.name} <span className="text-xs font-normal text-fg-muted">· {stageLabel(lead.stage)}</span></div>
                    <div className="truncate text-xs text-fg-muted">{reason}</div>
                  </Link>
                  {lead.phone ? (
                    <div className="flex shrink-0 gap-1">
                      <a href={`tel:${lead.phone.replace(/\s/g, "")}`} aria-label={`Ligar para ${lead.name}`} className="rounded-lg border border-border p-2 hover:bg-muted"><Phone className="h-4 w-4" /></a>
                      <a href={waLink(lead.phone)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${lead.name}`} className="rounded-lg border border-border p-2 hover:bg-muted"><MessageCircle className="h-4 w-4" /></a>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <EmptyState>Nenhum lead precisando de contato hoje.</EmptyState>}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between"><CardTitle>Agenda de hoje</CardTitle><Link href="/agenda" className="text-sm text-brand hover:underline">Abrir agenda</Link></div>
          <AppointmentList items={appts.appointments} leads={leads} />
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between"><CardTitle>Tarefas de hoje</CardTitle><Link href="/tarefas" className="text-sm text-brand hover:underline">Todas</Link></div>
          <TaskRows tasks={todayTasks.tasks} leads={leads} />
        </Card>

        {late.tasks.length > 6 ? (
          <Card className="lg:col-span-2">
            <CardTitle className="mb-3">Atrasados <Badge className="ml-2 bg-red-100 text-red-800">{late.tasks.length}</Badge></CardTitle>
            <TaskRows tasks={late.tasks.slice(6)} leads={leads} />
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Stat({ href, icon: Icon, label, value, alert }: { href: string; icon: typeof Phone; label: string; value: number; alert?: boolean }) {
  return (
    <Link href={href}>
      <Card className={alert ? "border-red-300 dark:border-red-900" : undefined}>
        <div className="flex items-center justify-between">
          <span className={`text-2xl font-bold tabular-nums ${alert ? "text-red-600" : ""}`}>{value}</span>
          <Icon className="h-5 w-5 text-fg-muted" aria-hidden />
        </div>
        <p className="text-xs text-fg-muted">{label}</p>
      </Card>
    </Link>
  );
}
