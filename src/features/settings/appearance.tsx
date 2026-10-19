"use client";

import { useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { ACCENTS, ACCENT_COOKIE, THEMES, THEME_COLOR, THEME_COOKIE, type Accent, type Theme } from "@/lib/appearance";
import { cn } from "@/lib/utils";

const ICON = { auto: Monitor, light: Sun, dark: Moon } as const;
const YEAR = 60 * 60 * 24 * 365;

function save(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

/** Atualiza a cor da barra do celular na hora (o servidor acerta no próximo carregamento). */
function syncThemeColor(theme: Theme) {
  const dark = theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? THEME_COLOR.dark : THEME_COLOR.light));
}

/** Tema e cor de destaque. Muda na hora, sem recarregar, e vale para este aparelho. */
export function AppearanceSettings({ theme: initialTheme, accent: initialAccent }: { theme: Theme; accent: Accent }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [accent, setAccent] = useState<Accent>(initialAccent);

  const pickTheme = (t: Theme) => {
    setTheme(t);
    save(THEME_COOKIE, t);
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    syncThemeColor(t);
  };
  const pickAccent = (a: Accent) => {
    setAccent(a);
    save(ACCENT_COOKIE, a);
    document.documentElement.dataset.accent = a;
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-[13px] font-medium text-fg-muted">Tema</div>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
          {THEMES.map((t) => {
            const Icon = ICON[t.value];
            const active = theme === t.value;
            return (
              <button key={t.value} type="button" role="radio" aria-checked={active} onClick={() => pickTheme(t.value)}
                className={cn("flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-sm font-semibold transition-colors",
                  active ? "border-brand bg-brand/10 text-brand" : "border-border bg-muted text-fg hover:bg-muted-2")}>
                <Icon className="h-5 w-5" aria-hidden />
                {t.label}
                <span className={cn("text-[11px] font-normal", active ? "text-brand/80" : "text-fg-muted")}>{t.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[13px] font-medium text-fg-muted">Cor de destaque</div>
        <div className="grid grid-cols-6 justify-items-center gap-1" role="radiogroup" aria-label="Cor de destaque">
          {ACCENTS.map((a) => {
            const active = accent === a.value;
            return (
              <button key={a.value} type="button" role="radio" aria-checked={active} aria-label={a.label} title={a.label}
                onClick={() => pickAccent(a.value)} className="flex flex-col items-center gap-1">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-full text-white shadow-md transition-transform",
                  active ? "scale-110 ring-2 ring-offset-2 ring-offset-bg" : "active:scale-95")}
                  style={{ backgroundColor: a.swatch, ...(active ? { ["--tw-ring-color" as string]: a.swatch } : {}) }}>
                  {active ? <Check className="h-5 w-5" aria-hidden /> : null}
                </span>
                <span className={cn("text-[11px]", active ? "font-semibold text-fg" : "text-fg-muted")}>{a.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-fg-muted">Vale para este aparelho. Os botões, o menu e os destaques do app mudam na hora.</p>
    </div>
  );
}
