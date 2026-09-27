import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function MeuDiaPage() {
  const session = await getSession();
  const supabase = await createClient();

  const [vehicles, leads, tasks] = await Promise.all([
    supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("status", "disponivel"),
    supabase.from("leads").select("id", { count: "exact", head: true }).not("stage", "in", "(venda,perdido)"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "pendente"),
  ]);
  const failed = [vehicles, leads, tasks].some((r) => r.error);

  const firstName = (session.fullName ?? session.email).split(" ")[0];

  return (
    <>
      <PageHeader title={`Olá, ${firstName}`} subtitle={session.teamName} />
      {failed ? (
        <Card className="text-sm text-red-700">Não foi possível carregar os números agora. Tente recarregar a página.</Card>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Veículos disponíveis" value={vehicles.count ?? 0} />
          <Stat label="Leads em aberto" value={leads.count ?? 0} />
          <Stat label="Tarefas pendentes" value={tasks.count ?? 0} />
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardTitle className="text-2xl font-bold tabular-nums">{value}</CardTitle>
      <p className="text-xs text-fg-muted">{label}</p>
    </Card>
  );
}
