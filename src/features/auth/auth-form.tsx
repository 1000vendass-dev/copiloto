"use client";

import { useFormAction } from "@/lib/use-form-action";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { requestPasswordReset, signIn, signUp, updatePassword } from "./actions";

type Mode = "login" | "cadastro" | "recuperar" | "nova-senha";

const actions = { login: signIn, cadastro: signUp, recuperar: requestPasswordReset, "nova-senha": updatePassword };
const titles = { login: "Entrar", cadastro: "Criar conta", recuperar: "Recuperar senha", "nova-senha": "Nova senha" };
const submits = { login: "Entrar", cadastro: "Criar conta", recuperar: "Enviar link", "nova-senha": "Salvar senha" };

export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const [state, onSubmit, pending] = useFormAction(actions[mode]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="text-2xl font-bold tracking-tight">Copiloto</div>
        <p className="text-sm text-fg-muted">Sua operação de vendas em um lugar só</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h1 className="text-lg font-semibold">{titles[mode]}</h1>
        {state?.error ? <Alert>{state.error}</Alert> : null}
        {state?.success ? <Alert kind="success">{state.success}</Alert> : null}
        {next ? <input type="hidden" name="next" value={next} /> : null}

        {mode === "cadastro" ? (
          <Field label="Seu nome" htmlFor="fullName">
            <Input id="fullName" name="fullName" autoComplete="name" required />
          </Field>
        ) : null}

        {mode !== "nova-senha" ? (
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
          </Field>
        ) : null}

        {mode !== "recuperar" ? (
          <Field label="Senha" htmlFor="password" hint={mode === "login" ? undefined : "Mínimo de 8 caracteres."}>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </Field>
        ) : null}

        {mode === "nova-senha" ? (
          <Field label="Confirmar senha" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" minLength={8} autoComplete="new-password" required />
          </Field>
        ) : null}

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? "Aguarde…" : submits[mode]}
        </Button>

        <div className="flex justify-between text-sm">
          {mode === "login" ? (
            <>
              <Link className="text-brand hover:underline" href="/cadastro">Criar conta</Link>
              <Link className="text-brand hover:underline" href="/recuperar-senha">Esqueci a senha</Link>
            </>
          ) : (
            <Link className="text-brand hover:underline" href="/login">Voltar para o login</Link>
          )}
        </div>
      </form>
    </div>
  );
}
