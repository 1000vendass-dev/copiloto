"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/utils";
import { searchVehicleOptions, type VehicleOption } from "./picker-actions";

/** Campo de formulário: busca veículo do estoque e grava o id em <input name={name}>. */
export function VehiclePicker({ name, initial }: { name: string; initial?: { id: string; label: string } | null }) {
  const [selected, setSelected] = useState(initial ?? null);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<VehicleOption[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (q.trim().length < 2) {
      setOptions([]);
      return;
    }
    const t = setTimeout(() => start(async () => setOptions(await searchVehicleOptions(q))), 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
          <span className="truncate">{selected.label}</span>
          <button type="button" aria-label="Remover veículo" onClick={() => setSelected(null)} className="text-fg-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no estoque: onix 2023, V097…" autoComplete="off" />
          {q.trim().length >= 2 ? (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
              {pending && !options.length ? <li className="px-3 py-2 text-sm text-fg-muted">Buscando…</li> : null}
              {!pending && !options.length ? <li className="px-3 py-2 text-sm text-fg-muted">Nenhum veículo encontrado.</li> : null}
              {options.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => { setSelected({ id: o.id, label: o.label }); setQ(""); }}
                  >
                    <span className="truncate">{o.label}</span>
                    <span className="shrink-0 text-fg-muted">{o.status === "disponivel" ? formatBRL(o.price) : o.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
