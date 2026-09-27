import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <Link href="/" className="text-brand hover:underline">Voltar para o início</Link>
    </div>
  );
}
