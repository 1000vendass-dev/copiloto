export const VEHICLE_STATUS = [
  { value: "disponivel", label: "Disponível", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  { value: "reservado", label: "Reservado", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  { value: "vendido", label: "Vendido", className: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  { value: "inativo", label: "Inativo", className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400" },
] as const;
export const statusLabel = (s: string) => VEHICLE_STATUS.find((x) => x.value === s)?.label ?? s;
export const statusClass = (s: string) => VEHICLE_STATUS.find((x) => x.value === s)?.className ?? "";

export const BODY_TYPES = [
  { value: "hatch", label: "Hatch" }, { value: "sedan", label: "Sedã" }, { value: "suv", label: "SUV" },
  { value: "picape", label: "Picape" }, { value: "minivan", label: "Minivan / Perua" }, { value: "utilitario", label: "Utilitário" },
  { value: "moto", label: "Moto" },
] as const;
export const bodyLabel = (s: string | null) => BODY_TYPES.find((b) => b.value === s)?.label ?? s ?? "—";

export const TRANSMISSIONS = [
  { value: "automatico", label: "Automático" }, { value: "manual", label: "Manual" },
  { value: "automatizado", label: "Automatizado" }, { value: "cvt", label: "CVT" },
] as const;
export const transmissionLabel = (s: string | null) => TRANSMISSIONS.find((t) => t.value === s)?.label ?? s ?? "—";

export const FUELS = ["flex", "gasolina", "diesel", "híbrido", "elétrico", "etanol", "gnv"];

export const SORTS = [
  { value: "recentes", label: "Mais recentes" },
  { value: "preco_asc", label: "Menor preço" },
  { value: "preco_desc", label: "Maior preço" },
  { value: "ano_desc", label: "Mais novos" },
  { value: "km_asc", label: "Menor km" },
] as const;

export const IMAGE_BUCKET = "vehicle-images";
