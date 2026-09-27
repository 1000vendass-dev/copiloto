import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ProfileForm } from "@/features/settings/forms";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function UserPage() {
  const session = await getSession();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name, phone").eq("id", session.userId).single();

  return (
    <>
      <PageHeader title="Meu perfil" subtitle={`Papel na equipe: ${session.role === "owner" ? "dono" : session.role}`} />
      <Card className="max-w-lg">
        <ProfileForm email={session.email} fullName={profile?.full_name ?? ""} phone={profile?.phone ?? ""} />
      </Card>
    </>
  );
}
