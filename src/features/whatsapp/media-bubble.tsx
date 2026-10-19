"use client";
/* eslint-disable @next/next/no-img-element -- arquivo vem da rota do app (bucket privado), sem otimização do Next */

import { useState } from "react";
import { FileText } from "lucide-react";
import { Lightbox } from "@/features/inventory/components/image-manager";
import { cn } from "@/lib/utils";
import type { WaMessage } from "./queries";

/** Legenda de verdade (o WhatsApp manda "[imagem]", "[áudio]" etc. quando não há texto). */
const caption = (body: string | null) => (body && !/^\[[^\]]+\]$/.test(body.trim()) ? body : null);

/** Conteúdo do balão: áudio com player, foto/figurinha (toque para ampliar), vídeo, documento ou texto. */
export function MessageContent({ m }: { m: WaMessage }) {
  const [zoom, setZoom] = useState(false);
  const src = `/api/whatsapp/media/${m.id}`;
  const text = caption(m.body);
  const out = m.direction === "saida";

  if (!m.media_path) return <p className="whitespace-pre-wrap break-words">{m.body}</p>;

  if (m.type === "audio") {
    return <audio controls preload="none" src={src} className="my-1 h-10 w-60 max-w-full" aria-label="Áudio" />;
  }

  const sticker = m.type === "imagem" && m.body?.trim() === "[figurinha]";
  return (
    <div className="space-y-1">
      {m.type === "imagem" ? (
        <>
          <button type="button" onClick={() => setZoom(true)} className="-mx-1.5 -mt-0.5 block overflow-hidden rounded-2xl" aria-label="Ampliar foto">
            <img src={src} alt={text ?? "Foto"} loading="lazy"
              className={cn("block object-cover", sticker ? "h-32 w-32 bg-transparent object-contain" : "max-h-80 w-64 max-w-full")} />
          </button>
          {zoom ? <Lightbox images={[{ url: src }]} index={0} onIndex={() => undefined} onClose={() => setZoom(false)} /> : null}
        </>
      ) : m.type === "video" ? (
        <video controls preload="metadata" src={src} className="-mx-1.5 -mt-0.5 max-h-80 w-64 max-w-full rounded-2xl" />
      ) : (
        <a href={src} target="_blank" rel="noopener noreferrer"
          className={cn("flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium", out ? "bg-white/15" : "bg-muted")}>
          <FileText className="h-5 w-5 shrink-0" aria-hidden />Abrir documento
        </a>
      )}
      {text ? <p className="whitespace-pre-wrap break-words">{text}</p> : null}
    </div>
  );
}
