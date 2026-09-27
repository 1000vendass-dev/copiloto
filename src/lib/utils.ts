import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export function formatBRL(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return brl.format(Number(value));
}

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
});
export function formatDateTime(value: string | null | undefined) {
  return value ? dateTime.format(new Date(value)) : "—";
}

const dateOnly = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
export function formatDate(value: string | null | undefined) {
  return value ? dateOnly.format(new Date(value)) : "—";
}
