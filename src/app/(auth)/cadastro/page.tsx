import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/auth-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function CadastroPage() {
  return <AuthForm mode="cadastro" />;
}
