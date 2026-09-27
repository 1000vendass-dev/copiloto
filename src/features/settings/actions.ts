"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: string } | undefined;

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  const parsed = z
    .object({
      full_name: z.string().trim().min(2, "Informe seu nome.").max(120),
      phone: z.string().trim().max(30).optional().transform((v) => v || null),
    })
    .safeParse({ full_name: formData.get("full_name"), phone: formData.get("phone") ?? undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", session.userId);
  if (error) return { error: "Não foi possível salvar o perfil." };
  revalidatePath("/", "layout");
  return { success: "Perfil atualizado." };
}

export async function updateTeamName(_: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (session.role === "member") return { error: "Apenas administradores podem renomear a equipe." };
  const name = z.string().trim().min(2, "Nome muito curto.").max(80).safeParse(formData.get("name"));
  if (!name.success) return { error: name.error.issues[0]?.message };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("teams")
    .update({ name: name.data }, { count: "exact" })
    .eq("id", session.teamId);
  if (error || !count) return { error: "Não foi possível renomear a equipe." };
  revalidatePath("/", "layout");
  return { success: "Equipe atualizada." };
}
