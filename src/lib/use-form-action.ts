"use client";

import { useActionState, useCallback, useTransition, type FormEvent } from "react";

type FormAction<S> = (prev: S | undefined, fd: FormData) => Promise<S | undefined>;

/**
 * Como useActionState, mas NÃO limpa o formulário após enviar (o React 19 limpa
 * formulários com `action={...}`). Assim, se der erro, o que foi digitado continua lá.
 * Uso: const [state, onSubmit, pending] = useFormAction(minhaAction); <form onSubmit={onSubmit}>
 */
export function useFormAction<S>(action: FormAction<S>) {
  // o React tipa o estado anterior como Awaited<S>; para os nossos estados (objetos simples) é o mesmo tipo
  const [state, dispatch, actionPending] = useActionState<S | undefined, FormData>(
    action as unknown as (prev: Awaited<S | undefined>, fd: FormData) => Promise<S | undefined>,
    undefined as Awaited<S | undefined>,
  );
  const [transitionPending, start] = useTransition();
  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      start(() => dispatch(fd));
    },
    [dispatch],
  );
  return [state as S | undefined, onSubmit, actionPending || transitionPending] as const;
}
