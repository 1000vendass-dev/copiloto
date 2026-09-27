import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";

export default function SemEquipePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Você ainda não faz parte de uma equipe</h1>
      <p className="text-sm text-fg-muted">Peça ao administrador da loja para adicionar seu e-mail à equipe.</p>
      <form action={signOut}><Button variant="outline" type="submit">Sair</Button></form>
    </div>
  );
}
