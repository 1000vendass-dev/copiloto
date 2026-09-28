"use client";

import { useActionState, useCallback, useTransition, type FormEvent } from "react";

/**
 * Como useActionState, mas NÃO limpa o formulário após enviar (o React 19 limpa
 * formulários com `action={...}`). Assim, se der erro, o que foi digitado continua lá.
 * Uso: const [state, onSubmit, pending] = useFormAction(minhaAction); <form onSubmit={onSubmit}>
 */
export function useFormAction<S>(action: (prev: S | undefined, fd: FormData) => Promise<S>) {
  const [state, dispatch, actionPending] = useActionState<S | undefined, FormData>(action, undefined);
  const [transitionPending, start] = useTransition();
  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      start(() => dispatch(fd));
    },
    [dispatch],
  );
  return [state, onSubmit, actionPending || transitionPending] as const;
}
