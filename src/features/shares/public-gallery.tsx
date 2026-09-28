"use client";
/* eslint-disable @next/next/no-img-element -- URLs assinadas do Supabase */

import { useState } from "react";
import { Car } from "lucide-react";
import { Lightbox } from "@/features/inventory/components/image-manager";

export function PublicGallery({ urls, alt }: { urls: string[]; alt: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  if (!urls.length) {
    return <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-muted text-fg-muted"><Car className="h-12 w-12" /></div>;
  }
  return (
    <div>
      <div
        className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl [scrollbar-width:none]"
        onScroll={(e) => { const el = e.currentTarget; setCurrent(Math.round(el.scrollLeft / el.clientWidth)); }}
      >
        {urls.map((u, i) => (
          <button key={u} type="button" onClick={() => setOpen(i)} className="aspect-[4/3] w-full shrink-0 snap-center bg-muted" aria-label={`Ampliar foto ${i + 1}`}>
            <img src={u} alt={i === 0 ? alt : ""} loading={i === 0 ? "eager" : "lazy"} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {urls.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {urls.map((u, i) => <span key={u} className={`h-1.5 rounded-full transition-all ${i === current ? "w-5 bg-brand" : "w-1.5 bg-muted-2"}`} />)}
        </div>
      ) : null}
      {open !== null ? <Lightbox images={urls.map((url) => ({ url }))} index={open} onIndex={setOpen} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
