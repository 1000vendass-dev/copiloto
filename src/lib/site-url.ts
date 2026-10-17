import "server-only";

import { headers } from "next/headers";

/**
 * Endereço público do app (ex.: https://copiloto.1000vendas.com), sem barra no fim.
 * Atrás do Docker/standalone o Next enxerga "0.0.0.0:3000"; por isso APP_URL, quando definida, manda.
 */
export function configuredAppUrl(): string | null {
  const v = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return v || null;
}

export async function getSiteOrigin(): Promise<string> {
  const fixed = configuredAppUrl();
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}
