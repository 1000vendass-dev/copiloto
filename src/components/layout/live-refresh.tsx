"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Tabelas que, ao mudar, atualizam a tela aberta (precisam estar na publicação supabase_realtime). */
const TABLES = ["whatsapp_conversations", "whatsapp_messages", "whatsapp_drafts", "leads", "tasks", "appointments"] as const;
const DEBOUNCE_MS = 700;
const FALLBACK_MS = 60_000;

/**
 * Deixa o app "vivo" como um app de celular: quando chega mensagem ou algo muda no banco, a tela se atualiza
 * sozinha (Supabase Realtime → router.refresh). Também atualiza ao voltar para o app e, por garantia,
 * a cada minuto se a conexão em tempo real cair.
 */
export function LiveRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };

    const supabase = createClient();
    let live = false;
    let channel = supabase.channel("copiloto-live");
    for (const table of TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe((status) => { live = status === "SUBSCRIBED"; });

    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    const fallback = setInterval(() => { if (!live && document.visibilityState === "visible") refresh(); }, FALLBACK_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(fallback);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
