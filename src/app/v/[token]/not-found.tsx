export default function FichaIndisponivel() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-xl font-semibold">Ficha indisponível</h1>
      <p className="text-sm text-fg-muted">Este link expirou ou foi desativado. Peça um novo link ao vendedor.</p>
    </div>
  );
}
