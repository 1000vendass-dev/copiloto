import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, Card, CardTitle, EmptyState } from "@/components/ui/card";
import { OPEN_STAGES, STAGES } from "@/features/crm/constants";
import { bodyLabel } from "@/features/inventory/constants";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/utils";

export const metadata: Metadata = { title: "Painel" };

type KN = { k: string; n: number };
type Metrics = {
  funil: Record<string, number>; leads_novos_mes: number; vendas_mes: number; faturamento_mes: number; vendas_90d: number;
  perdidos_90d: number; origens: KN[]; contatos_7d: number; propostas_abertas: { n: number; valor: number };
  estoque: { disponiveis: number; reservados: number; vendidos_mes: number; valor_disponivel: number; idade_media_dias: number; parados_60d: number; sem_foto: number };
  carrocerias: KN[]; faixas_preco: KN[]; lojas: KN[];
};

/** Barras horizontais de uma série (magnitude): um tom só, valor escrito ao lado, título nativo no hover. */
function Bars({ items, href }: { items: { label: string; n: number; key?: string }[]; href?: (key: string) => string }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  if (!items.some((i) => i.n > 0)) return <EmptyState>Nenhum registro encontrado.</EmptyState>;
  return (
    <ul className="space-y-2">
      {items.map((i) => {
        const row = (
          <div className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 text-sm" title={`${i.label}: ${i.n}`}>
            <span className="truncate text-fg-muted">{i.label}</span>
            <span className="h-3 rounded-r bg-muted"><span className="block h-3 rounded-r bg-brand" style={{ width: `${(i.n / max) * 100}%`, minWidth: i.n ? 4 : 0 }} /></span>
            <span className="text-right tabular-nums">{i.n}</span>
          </div>
        );
        return <li key={i.label}>{href && i.key ? <Link href={href(i.key)} className="block rounded hover:bg-muted">{row}</Link> : row}</li>;
      })}
    </ul>
  );
}

function Tile({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <Card className="h-full">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-fg-muted">{label}</div>
      {hint ? <div className="mt-1 text-[11px] text-fg-muted">{hint}</div> : null}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function PainelPage() {
  const session = await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_metrics", { p_team: session.teamId });
  if (error || !data) return (<><PageHeader title="Painel" /><Alert>Não foi possível carregar as métricas. Tente recarregar.</Alert></>);
  const m = data as Metrics;
  const open = OPEN_STAGES.reduce((s, st) => s + (m.funil[st] ?? 0), 0);
  const closed90 = m.vendas_90d + m.perdidos_90d;
  const conv = closed90 ? Math.round((m.vendas_90d / closed90) * 100) : null;

  return (
    <>
      <PageHeader title="Painel" subtitle="Números atuais do seu banco de dados" />
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">Vendas</h2>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Vendas no mês" value={String(m.vendas_mes)} hint={formatBRL(m.faturamento_mes)} href="/leads?stage=venda" />
        <Tile label="Leads em aberto" value={String(open)} hint={`${m.leads_novos_mes} novos no mês`} href="/leads" />
        <Tile label="Conversão (90 dias)" value={conv === null ? "—" : `${conv}%`} hint={closed90 ? `${m.vendas_90d} vendas · ${m.perdidos_90d} perdidos` : "sem negócios fechados ainda"} />
        <Tile label="Propostas abertas" value={String(m.propostas_abertas.n)} hint={formatBRL(m.propostas_abertas.valor)} href="/propostas" />
      </div>
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">Estoque</h2>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Disponíveis" value={String(m.estoque.disponiveis)} hint={formatBRL(m.estoque.valor_disponivel)} href="/estoque" />
        <Tile label="Idade média" value={`${m.estoque.idade_media_dias} dias`} hint={`${m.estoque.parados_60d} parados há +60 dias`} />
        <Tile label="Reservados" value={String(m.estoque.reservados)} href="/estoque?status=reservado" />
        <Tile label="Sem foto" value={String(m.estoque.sem_foto)} hint="veículos disponíveis" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardTitle className="mb-3">Funil (leads por etapa)</CardTitle>
          <Bars items={STAGES.map((s) => ({ label: s.label, n: m.funil[s.value] ?? 0, key: s.value }))} href={(k) => `/leads?stage=${k}`} />
        </Card>
        <Card><CardTitle className="mb-3">Origem dos leads</CardTitle><Bars items={m.origens.map((o) => ({ label: o.k, n: o.n }))} /></Card>
        <Card><CardTitle className="mb-3">Estoque por carroceria</CardTitle>
          <Bars items={m.carrocerias.map((c) => ({ label: bodyLabel(c.k), n: c.n, key: c.k }))} href={(k) => `/estoque?body=${k}`} />
        </Card>
        <Card><CardTitle className="mb-3">Estoque por faixa de preço</CardTitle><Bars items={m.faixas_preco.map((f) => ({ label: f.k, n: f.n }))} /></Card>
        <Card><CardTitle className="mb-3">Estoque por loja</CardTitle>
          <Bars items={m.lojas.map((l) => ({ label: l.k, n: l.n, key: l.k }))} href={(k) => `/estoque?store=${encodeURIComponent(k)}`} />
        </Card>
        <Card><CardTitle className="mb-3">Atividade</CardTitle>
          <p className="text-sm"><strong className="text-2xl tabular-nums">{m.contatos_7d}</strong> contatos registrados nos últimos 7 dias.</p>
        </Card>
      </div>
    </>
  );
}
