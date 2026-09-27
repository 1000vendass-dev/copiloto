"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: string } | undefined;

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function safeNext(next: FormDataEntryValue | null) {
  const v = typeof next === "string" ? next : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres."),
});

function translate(message: string) {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).";
  if (/already registered/i.test(message)) return "Este e-mail já tem cadastro. Faça login.";
  if (/rate limit/i.test(message)) return "Muitas tentativas. Aguarde alguns minutos.";
  return "Não foi possível concluir. Tente novamente.";
}

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: translate(error.message) };

  redirect(safeNext(formData.get("next")));
}

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials
    .extend({ fullName: z.string().trim().min(2, "Informe seu nome.") })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      fullName: formData.get("fullName"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await origin()}/auth/confirm`,
    },
  });
  if (error) return { error: translate(error.message) };
  if (data.session) redirect("/");
  return { success: "Cadastro criado. Enviamos um e-mail de confirmação — clique no link para entrar." };
}

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "E-mail inválido." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${await origin()}/auth/confirm?next=/auth/nova-senha`,
  });
  // resposta idêntica exista ou não o e-mail (não revela cadastros)
  return { success: "Se o e-mail estiver cadastrado, você receberá um link para criar nova senha." };
}

export async function updatePassword(_: FormState, formData: FormData): Promise<FormState> {
  const password = z.string().min(8, "A senha precisa de pelo menos 8 caracteres.").safeParse(formData.get("password"));
  if (!password.success) return { error: password.error.issues[0]?.message };
  if (formData.get("password") !== formData.get("confirm")) return { error: "As senhas não conferem." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: "Link expirado ou inválido. Solicite outro." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
