import type { Metadata } from "next";
import { CopilotoChat } from "@/features/ai/chat";

export const metadata: Metadata = { title: { absolute: "Copiloto · Assistente" } };

/**
 * Tela cheia: ocupa da margem de cima até logo acima do menu flutuante. O -mb-28 anula a sobra que o
 * layout reserva embaixo das outras páginas (senão ficava um vão entre a caixa de mensagem e o menu).
 */
export default function CopilotoPage() {
  return (
    <div className="-mb-28 flex h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))] flex-col pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:-mb-10 md:h-[calc(100dvh-1.5rem)] md:pb-6">
      <h1 className="mb-3 text-[28px] font-bold tracking-tight">Copiloto</h1>
      <CopilotoChat className="min-h-0 flex-1" />
    </div>
  );
}
