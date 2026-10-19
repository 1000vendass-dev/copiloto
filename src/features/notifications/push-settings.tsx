"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { removePushSubscription, savePushSubscription, sendTestPush } from "./actions";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function keyToBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Liga/desliga as notificações de mensagem nova NESTE aparelho (cada celular/computador ativa o seu). */
export function PushSettings({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") { setState("denied"); return; }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = () => start(async () => {
    setMsg(null);
    if (!publicKey) { setMsg({ kind: "error", text: "Notificações ainda não configuradas no servidor." }); return; }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
    const r = await savePushSubscription(sub.toJSON(), navigator.userAgent);
    if (!r.ok) { setMsg({ kind: "error", text: r.error ?? "Erro ao ativar." }); return; }
    setState("on");
    setMsg({ kind: "success", text: "Pronto! Este aparelho vai avisar quando chegar mensagem de cliente." });
  });

  const disable = () => start(async () => {
    setMsg(null);
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
    setState("off");
  });

  const test = () => start(async () => {
    const r = await sendTestPush();
    setMsg(r.ok ? { kind: "success", text: "Teste enviado. Deve aparecer em alguns segundos." } : { kind: "error", text: r.error ?? "Falhou." });
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">Aviso no celular quando um cliente manda mensagem no WhatsApp, mesmo com o app fechado. Tocar no aviso abre o card do lead.</p>
      {state === "loading" ? <p className="text-sm text-fg-muted">Verificando este aparelho…</p> : null}
      {state === "unsupported" ? <Alert kind="info">Este navegador não aceita notificações. No Android use o Chrome; no computador, Chrome ou Edge.</Alert> : null}
      {state === "ios-install" ? <Alert kind="info">No iPhone, primeiro instale o app: Compartilhar → “Adicionar à Tela de Início”. Depois abra o Copiloto pelo ícone e volte aqui.</Alert> : null}
      {state === "denied" ? <Alert kind="info">As notificações estão bloqueadas para este site. Libere nas configurações do navegador (cadeado ao lado do endereço → Notificações → Permitir) e volte aqui.</Alert> : null}
      {msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {state === "off" ? <Button onClick={enable} disabled={pending}><Bell className="h-4 w-4" />{pending ? "Ativando…" : "Ativar notificações"}</Button> : null}
        {state === "on" ? (
          <>
            <Button variant="outline" onClick={test} disabled={pending}><Send className="h-4 w-4" />Enviar teste</Button>
            <Button variant="ghost" onClick={disable} disabled={pending}><BellOff className="h-4 w-4" />Desativar aqui</Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
