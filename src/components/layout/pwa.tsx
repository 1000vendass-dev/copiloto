"use client";

import { useEffect, useState } from "react";

/** Registra o service worker (instalação como app e página "sem conexão"). */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Botão "Instalar app" (Android/Chrome) + instruções para iPhone. */
export function InstallApp() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (installed) return <p className="text-sm text-fg-muted">✅ O Copiloto já está instalado neste aparelho.</p>;
  if (evt) {
    return (
      <button type="button" onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}
        className="w-full rounded-lg bg-brand px-4 py-3 font-medium text-white">
        Instalar o Copiloto neste aparelho
      </button>
    );
  }
  return (
    <p className="text-sm text-fg-muted">
      {ios
        ? "No iPhone: toque em Compartilhar (quadrado com seta) → “Adicionar à Tela de Início”."
        : "No Android: menu ⋮ do Chrome → “Instalar app” ou “Adicionar à tela inicial”. No computador: ícone de instalar na barra de endereço."}
    </p>
  );
}
