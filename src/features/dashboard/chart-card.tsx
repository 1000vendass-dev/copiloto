"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, List } from "lucide-react";
import { Card, CardTitle, EmptyState } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ChartItem = { label: string; n: number; href?: string };
type View = "lista" | "grafico";

const STORE = "painel-view:";

/**
 * Card do Painel com duas formas de ver a mesma série: lista (barras horizontais, o padrão) e gráfico de
 * colunas. Uma série só = um tom (a cor de destaque), sem legenda. A escolha fica salva por card no aparelho.
 */
export function ChartCard({ id, title, items }: { id: string; title: string; items: ChartItem[] }) {
  const [view, setView] = useState<View>("lista");
  useEffect(() => {
    try { if (localStorage.getItem(STORE + id) === "grafico") setView("grafico"); } catch { /* sem storage: fica na lista */ }
  }, [id]);
  const toggle = () => {
    const next: View = view === "lista" ? "grafico" : "lista";
    setView(next);
    try { localStorage.setItem(STORE + id, next); } catch { /* ok */ }
  };
  const empty = !items.some((i) => i.n > 0);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {!empty ? (
          <button type="button" onClick={toggle}
            className="flex h-9 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-semibold text-fg-muted transition-colors hover:bg-muted-2 hover:text-fg"
            aria-label={view === "lista" ? `Ver ${title} em gráfico` : `Ver ${title} em lista`}>
            {view === "lista" ? <><BarChart3 className="h-4 w-4" aria-hidden />Gráfico</> : <><List className="h-4 w-4" aria-hidden />Lista</>}
          </button>
        ) : null}
      </div>
      {empty ? <EmptyState>Nenhum registro encontrado.</EmptyState> : view === "lista" ? <Bars items={items} /> : <Columns items={items} />}
    </Card>
  );
}

/** Barras horizontais: nome, barra e valor. É a "tabela" do gráfico: todo valor fica visível sem hover. */
function Bars({ items }: { items: ChartItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <ul className="space-y-2">
      {items.map((i) => {
        const row = (
          <div className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 text-sm" title={`${i.label}: ${i.n}`}>
            <span className="truncate text-fg-muted">{i.label}</span>
            <span className="h-2.5 rounded-full bg-muted"><span className="block h-2.5 rounded-full bg-brand" style={{ width: `${(i.n / max) * 100}%`, minWidth: i.n ? 4 : 0 }} /></span>
            <span className="text-right tabular-nums">{i.n}</span>
          </div>
        );
        return <li key={i.label}>{i.href ? <Link href={i.href} className="block rounded-xl px-1 hover:bg-muted">{row}</Link> : row}</li>;
      })}
    </ul>
  );
}

const PLOT_H = 160; // altura da área das colunas (px)

/**
 * Colunas verticais: <= 24px de largura, ponta arredondada de 4px, quadrada na linha de base. O valor do maior
 * fica escrito no topo; os outros aparecem ao passar o dedo/mouse ou no foco do teclado (e na lista).
 */
function Columns({ items }: { items: ChartItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  const top = items.reduce((a, b) => (b.n > a.n ? b : a), items[0]);
  const [active, setActive] = useState<number | null>(null);
  const ticks = [max, Math.round(max / 2), 0].filter((v, k, a) => a.indexOf(v) === k);

  return (
    <div className="relative" onPointerLeave={() => setActive(null)}>
      <div className="flex gap-2">
        {/* eixo Y: 3 marcas redondas, discretas */}
        <div className="relative w-6 shrink-0 text-right text-[10px] tabular-nums text-fg-muted" style={{ height: PLOT_H }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: PLOT_H - (t / max) * PLOT_H }}>{t}</span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative border-b border-border" style={{ height: PLOT_H }}>
            {ticks.filter((t) => t > 0).map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-border/70" style={{ top: PLOT_H - (t / max) * PLOT_H }} aria-hidden />
            ))}
            <ul className="absolute inset-0 flex items-end">
              {items.map((i, k) => {
                const h = i.n ? Math.max(3, (i.n / max) * PLOT_H) : 0;
                const col = (
                  <span className="flex h-full w-full flex-col items-center justify-end" aria-label={`${i.label}: ${i.n}`}>
                    {i === top && i.n > 0 ? <span className="mb-1 text-[11px] font-semibold tabular-nums text-fg">{i.n}</span> : null}
                    <span className={cn("block w-full max-w-6 rounded-t-[4px] bg-brand transition-opacity", active !== null && active !== k && "opacity-45")}
                      style={{ height: h }} />
                  </span>
                );
                const hit = "flex h-full w-full px-[1px] outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-brand";
                return (
                  <li key={i.label} className="h-full min-w-0 flex-1" onPointerEnter={() => setActive(k)}>
                    {i.href
                      ? <Link href={i.href} className={hit} onFocus={() => setActive(k)} onBlur={() => setActive(null)}>{col}</Link>
                      : <span tabIndex={0} className={hit} onFocus={() => setActive(k)} onBlur={() => setActive(null)}>{col}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
          {/* eixo X: nomes inclinados para caberem no celular */}
          <ul className="flex h-16" aria-hidden>
            {items.map((i) => (
              <li key={i.label} className="relative min-w-0 flex-1">
                {/* ancorado pela ponta direita embaixo da coluna e inclinado para baixo-esquerda: nunca sobe no gráfico */}
                <span className="absolute right-1/2 top-1 origin-top-right whitespace-nowrap text-[10px] text-fg-muted" style={{ transform: "translateX(-5px) rotate(-40deg)" }}>
                  {i.label.length > 14 ? `${i.label.slice(0, 13)}…` : i.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {active !== null ? (
        <div className="glass-float pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-2xl px-3 py-2 text-center" role="status">
          <div className="text-base font-bold tabular-nums">{items[active].n}</div>
          <div className="max-w-40 truncate text-xs text-fg-muted">{items[active].label}</div>
        </div>
      ) : null}
    </div>
  );
}
