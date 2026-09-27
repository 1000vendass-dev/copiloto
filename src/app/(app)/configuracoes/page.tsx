import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { signOut } from "@/features/auth/actions";
import { TeamForm } from "@/features/settings/forms";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Configurações" };

const ROLE_LABEL = { owner: "Dono", admin: "Administrador", member: "Vendedor" } as const;

export default async function ConfiguracoesPage() {
  const session = await getSession();
  const supabase = await createClient();
  const { data: members } = await supabase.from("team_members").select("user_id, role").eq("team_id", session.teamId);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Equipe</CardTitle>
          <TeamForm name={session.teamName} canEdit={session.role !== "member"} />
        </Card>
        <Card>
          <CardTitle className="mb-3">Membros</CardTitle>
          <ul className="divide-y divide-border">
            {(members ?? []).map((m) => {
              return (
                <li key={m.user_id} className="flex justify-between py-2 text-sm">
                  <span>{nameOf.get(m.user_id) ?? "—"}{m.user_id === session.userId ? " (você)" : ""}</span>
                  <span className="text-fg-muted">{ROLE_LABEL[m.role as keyof typeof ROLE_LABEL]}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardTitle className="mb-3">Conta</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Link href="/user"><Button variant="outline">Meu perfil</Button></Link>
            <form action={signOut}><Button variant="danger" type="submit">Sair</Button></form>
          </div>
        </Card>
      </div>
    </>
  );
}
