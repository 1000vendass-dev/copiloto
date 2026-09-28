"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { cn, formatBRL } from "@/lib/utils";
import { previewImport, runImport, type PreviewItem } from "./actions";
import { TARGET_FIELDS, buildRow, detectMapping, type ImportRow, type Mapping, type TargetKey } from "./normalize";

type Sheet = { headers: string[]; rows: unknown[][]; fileName: string };

async function readFile(file: File): Promise<Sheet> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false, codepage: 65001 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "", blankrows: false });
  // primeira linha com pelo menos 2 células preenchidas = cabeçalho
  const hIdx = all.findIndex((r) => r.filter((c) => String(c).trim()).length >= 2);
  if (hIdx < 0) throw new Error("Não encontrei linhas com dados.");
  return { headers: all[hIdx].map((h) => String(h).trim()), rows: all.slice(hIdx + 1), fileName: file.name };
}

export function ImportWizard() {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);

  const built: ImportRow[] = useMemo(
    () => (sheet ? sheet.rows.map((r, i) => buildRow(r, mapping, i + 2)).filter((r) => r.data || r.errors.length) : []),
    [sheet, mapping],
  );
  const valid = built.filter((r) => r.data);
  const invalid = built.filter((r) => !r.data);
  const counts = preview ? {
    novo: preview.filter((p) => p.action === "novo").length,
    atualizar: preview.filter((p) => p.action === "atualizar").length,
    duplicado: preview.filter((p) => p.action === "duplicado").length,
  } : null;
  const byLine = new Map((preview ?? []).map((p) => [p.line, p]));

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null); setPreview(null); setResult(null);
    if (f.size > 10 * 1024 * 1024) { setError("Arquivo maior que 10 MB."); return; }
    try {
      setBusy("Lendo planilha…");
      const s = await readFile(f);
      setSheet(s);
      setMapping(detectMapping(s.headers));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler o arquivo. Use CSV ou XLSX.");
    } finally { setBusy(null); }
  }

  async function doPreview() {
    setError(null); setBusy("Validando com o estoque atual…");
    const r = await previewImport(valid.map((v) => ({ line: v.line, data: v.data })));
    setBusy(null);
    if (!r.ok) setError(r.error ?? "Erro"); else setPreview(r.items ?? []);
  }

  async function doImport() {
    if (!sheet) return;
    setError(null); setBusy("Importando…");
    const r = await runImport(valid.map((v) => ({ line: v.line, data: v.data })), updateExisting, sheet.fileName);
    setBusy(null);
    if (!r.ok) setError(r.error ?? "Erro");
    else setResult({ created: r.created ?? 0, updated: r.updated ?? 0, skipped: r.skipped ?? 0 });
  }

  if (result) {
    return (
      <Card className="space-y-3">
        <Alert kind="success">Importação concluída: {result.created} novos, {result.updated} atualizados, {result.skipped} ignorados.</Alert>
        <div className="flex gap-2"><Link href="/estoque"><Button>Ver estoque</Button></Link><Button variant="outline" onClick={() => { setSheet(null); setPreview(null); setResult(null); }}>Importar outra</Button></div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Card className="space-y-3">
        <CardTitle>1. Arquivo</CardTitle>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-border p-4 hover:border-brand">
          <FileSpreadsheet className="h-8 w-8 text-fg-muted" aria-hidden />
          <span className="text-sm">{sheet ? <><strong>{sheet.fileName}</strong> · {sheet.rows.length} linhas</> : "Escolha uma planilha CSV ou Excel (XLSX)"}</span>
          <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {busy ? <p className="text-sm text-fg-muted">{busy}</p> : null}
      </Card>

      {sheet ? (
        <Card className="space-y-3">
          <CardTitle>2. Colunas</CardTitle>
          <p className="text-sm text-fg-muted">Detectei as colunas automaticamente. Confira e ajuste se precisar.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TARGET_FIELDS.map((f) => (
              <label key={f.key} className="text-sm">
                <span className="mb-1 block font-medium">{f.label}</span>
                <Select value={mapping[f.key] ?? ""} onChange={(e) => { setPreview(null); setMapping((m) => ({ ...m, [f.key as TargetKey]: e.target.value === "" ? undefined : Number(e.target.value) })); }}>
                  <option value="">— não importar —</option>
                  {sheet.headers.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
                </Select>
              </label>
            ))}
          </div>
          <Button onClick={doPreview} disabled={!!busy || !valid.length || mapping.brand === undefined || mapping.model === undefined}>Validar e pré-visualizar</Button>
        </Card>
      ) : null}

      {sheet && preview && counts ? (
        <Card className="space-y-3">
          <CardTitle>3. Pré-visualização</CardTitle>
          <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-5">
            <Stat label="registros" n={built.length} />
            <Stat label="novos" n={counts.novo} tone="text-green-700" />
            <Stat label="atualizações" n={counts.atualizar} tone="text-blue-700" />
            <Stat label="sem mudança" n={counts.duplicado} />
            <Stat label="com erro" n={invalid.length} tone={invalid.length ? "text-red-700" : undefined} />
          </div>
          {counts.atualizar ? (
            <label className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
              <span>Atualizar os {counts.atualizar} veículos que já existem (encontrados pelo código ou pela placa). <br /><span className="text-fg-muted">Desmarcado: eles são ignorados e nada do estoque atual é alterado.</span></span>
            </label>
          ) : null}
          <div className="max-h-96 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted"><tr><th className="p-2">Linha</th><th className="p-2">Veículo</th><th className="p-2">Ano</th><th className="p-2">Preço</th><th className="p-2">Situação</th></tr></thead>
              <tbody>
                {built.slice(0, 300).map((r) => {
                  const p = byLine.get(r.line);
                  const st = !r.data ? { t: `Erro: ${r.errors.join(", ")}`, c: "text-red-700" }
                    : p?.action === "novo" ? { t: "Novo", c: "text-green-700" }
                    : p?.action === "atualizar" ? { t: `Atualiza: ${p.changes?.join(", ")}`, c: "text-blue-700" }
                    : { t: "Já existe, sem mudança", c: "text-fg-muted" };
                  return (
                    <tr key={r.line} className="border-t border-border">
                      <td className="p-2 tabular-nums">{r.line}</td>
                      <td className="p-2">{r.data ? `${r.data.stock_code ? r.data.stock_code + " · " : ""}${r.data.brand} ${r.data.model} ${r.data.version ?? ""}` : "—"}</td>
                      <td className="p-2">{r.data?.year_model ?? "—"}</td>
                      <td className="p-2 tabular-nums">{r.data ? formatBRL(r.data.sale_price) : "—"}</td>
                      <td className={cn("p-2", st.c)}>{st.t}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button size="lg" onClick={doImport} disabled={!!busy || (counts.novo === 0 && !(updateExisting && counts.atualizar))}>
            {busy ?? `Importar ${counts.novo} novo(s)${updateExisting && counts.atualizar ? ` e atualizar ${counts.atualizar}` : ""}`}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, n, tone }: { label: string; n: number; tone?: string }) {
  return <div className="rounded-lg bg-muted p-2"><div className={cn("text-xl font-bold tabular-nums", tone)}>{n}</div><div className="text-fg-muted">{label}</div></div>;
}
