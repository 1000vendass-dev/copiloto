import type { Metadata } from "next";
import { CopilotoChat } from "@/features/ai/chat";

export const metadata: Metadata = { title: { absolute: "Copiloto · Assistente" } };

export default function CopilotoPage() {
  return (
    <>
      <h1 className="mb-3 text-2xl font-bold tracking-tight">Copiloto</h1>
      <CopilotoChat />
    </>
  );
}
