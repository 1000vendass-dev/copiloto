"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-sm flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Algo deu errado</h1>
      <p className="text-sm text-fg-muted">Não conseguimos carregar esta tela. Verifique sua conexão e tente de novo.</p>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
