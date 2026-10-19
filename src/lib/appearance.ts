/**
 * Aparência escolhida em Configurações: tema (automático/claro/escuro) e cor de destaque.
 * Fica num cookie do aparelho; o layout raiz lê o cookie e coloca data-theme/data-accent no <html>,
 * então a página já chega do servidor com as cores certas (sem "piscar").
 */

export const THEME_COOKIE = "copiloto-theme";
export const ACCENT_COOKIE = "copiloto-accent";

export const THEMES = [
  { value: "auto", label: "Automático", hint: "Segue o celular" },
  { value: "light", label: "Claro", hint: "Sempre claro" },
  { value: "dark", label: "Escuro", hint: "Sempre escuro" },
] as const;
export type Theme = (typeof THEMES)[number]["value"];

/** `swatch` é o tom do claro, só para a bolinha de escolha (a cor real vem do CSS). */
export const ACCENTS = [
  { value: "azul", label: "Azul", swatch: "#2563eb" },
  { value: "violeta", label: "Violeta", swatch: "#7c3aed" },
  { value: "rosa", label: "Rosa", swatch: "#db2777" },
  { value: "laranja", label: "Laranja", swatch: "#ea580c" },
  { value: "verde", label: "Verde", swatch: "#059669" },
  { value: "turquesa", label: "Turquesa", swatch: "#0891b2" },
] as const;
export type Accent = (typeof ACCENTS)[number]["value"];

export const parseTheme = (v: string | undefined): Theme => (THEMES.some((t) => t.value === v) ? (v as Theme) : "auto");
export const parseAccent = (v: string | undefined): Accent => (ACCENTS.some((a) => a.value === v) ? (v as Accent) : "azul");

export const THEME_COLOR = { light: "#f2f4f8", dark: "#07090e" } as const;
