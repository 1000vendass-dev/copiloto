import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type TeamRole = "owner" | "admin" | "member";

export type SessionContext = {
  userId: string;
  email: string;
  fullName: string | null;
  teamId: string;
  teamName: string;
  role: TeamRole;
};

/**
 * Quem está logado, a qual equipe pertence e qual papel tem.
 * Cacheado por request. Redireciona para /login se não houver sessão.
 */
export const getSession = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, default_team_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data: memberships } = await supabase
    .from("team_members")
    .select("team_id, role, teams(name)")
    .eq("user_id", user.id);

  const list = memberships ?? [];
  const current = list.find((m) => m.team_id === profile?.default_team_id) ?? list[0];

  if (!current) redirect("/sem-equipe");

  const team = current.teams as unknown as { name: string } | null;

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? null,
    teamId: current.team_id,
    teamName: team?.name ?? "Minha equipe",
    role: current.role as TeamRole,
  };
});
