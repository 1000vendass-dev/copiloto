import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/auth-form";

export const metadata: Metadata = { title: "Nova senha" };

export default function NovaSenhaPage() {
  return <AuthForm mode="nova-senha" />;
}
