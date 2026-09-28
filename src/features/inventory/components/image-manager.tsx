"use client";
/* eslint-disable @next/next/no-img-element -- URLs assinadas do Supabase */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { VehicleImage } from "@/types/db";
import { deleteImage, moveImage, registerImages, replaceImageFile, setPrimaryImage } from "../actions";
import { IMAGE_BUCKET } from "../constants";

const MAX_SIDE = 1600;
const MAX_BYTES = 10 * 1024 * 1024;

const isHeic = (f: { type?: string; name?: string }) =>
  /image\/hei[cf]/i.test(f.type ?? "") || /\.hei[cf]$/i.test(f.name ?? "");

/** HEIC/HEIF (fotos do iPhone) → JPEG no próprio navegador. Carrega o conversor só quando precisa. */
async function heicToJpeg(blob: Blob): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.85 });
  return Array.isArray(out) ? out[0] : out;
}

/** Redimensiona para no máx. 1600px e converte para JPEG ~82%. Mantém o original se não conseguir decodificar. */
async function compress(input: File | Blob, name = ""): Promise<Blob> {
  let file: Blob = input;
  if (isHeic({ type: input.type, name: (input as File).name ?? name })) {
    try { file = await heicToJpeg(input); } catch { /* segue com o original */ }
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (blob && (blob.size < file.size || file.type !== "image/jpeg")) return blob;
  } catch {
    /* formato não decodificável no navegador (ex.: HEIC fora do Safari) */
  }
  return file;
}

export function ImageManager({ vehicleId, teamId, images }: { vehicleId: string; teamId: string; images: VehicleImage[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const supabase = createClient();
    const paths: string[] = [];
    const failed: string[] = [];
    const list = [...files].slice(0, 20);
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      setBusy(`Enviando ${i + 1} de ${list.length}…`);
      if (!f.type.startsWith("image/") && !isHeic(f)) { failed.push(`${f.name} (não é imagem)`); continue; }
      const blob = await compress(f);
      if (blob.size > MAX_BYTES) { failed.push(`${f.name} (maior que 10 MB)`); continue; }
      if (isHeic(blob) || (blob === f && isHeic(f))) { failed.push(`${f.name} (não foi possível converter a foto do iPhone)`); continue; }
      const ext = blob.type === "image/jpeg" ? "jpg" : (f.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `${teamId}/${vehicleId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, {
        contentType: blob.type || f.type, upsert: false, cacheControl: "31536000",
      });
      if (upErr) failed.push(`${f.name} (${/mime|type/i.test(upErr.message) ? "formato não aceito" : "falha no envio"})`);
      else paths.push(path);
    }
    if (paths.length) {
      setBusy("Salvando…");
      const r = await registerImages(vehicleId, paths);
      if (!r.ok) failed.push(r.error ?? "Erro ao registrar fotos");
    }
    setBusy(null);
    if (failed.length) setError(`Não enviadas: ${failed.join(", ")}`);
    if (fileRef.current) fileRef.current.value = "";
    if (camRef.current) camRef.current.value = "";
  }

  const heicImages = images.filter((i) => /\.hei[cf]$/i.test(i.storage_path));

  async function convertExisting() {
    setError(null);
    const supabase = createClient();
    let fail = 0;
    for (let i = 0; i < heicImages.length; i++) {
      const img = heicImages[i];
      setBusy(`Convertendo ${i + 1} de ${heicImages.length}…`);
      try {
        if (!img.url) throw new Error("sem url");
        const res = await fetch(img.url);
        if (!res.ok) throw new Error("download");
        const jpg = await compress(await res.blob(), img.storage_path);
        if (jpg.type !== "image/jpeg") throw new Error("conversao");
        const path = `${teamId}/${vehicleId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from(IMAGE_BUCKET).upload(path, jpg, { contentType: "image/jpeg", cacheControl: "31536000" });
        if (upErr) throw upErr;
        const r = await replaceImageFile(img.id, path);
        if (!r.ok) { await supabase.storage.from(IMAGE_BUCKET).remove([path]); throw new Error(r.error); }
      } catch {
        fail++;
      }
    }
    setBusy(null);
    if (fail) setError(`${fail} foto(s) não puderam ser convertidas.`);
  }

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => { const r = await fn(); if (!r.ok) setError(r.error ?? "Erro"); });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files)} />
        <Button type="button" variant="outline" disabled={!!busy} onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" />Adicionar fotos</Button>
        <Button type="button" variant="outline" disabled={!!busy} onClick={() => camRef.current?.click()} className="sm:hidden"><Camera className="h-4 w-4" />Câmera</Button>
        {heicImages.length ? (
          <Button type="button" variant="primary" disabled={!!busy} onClick={convertExisting}>Converter {heicImages.length} foto(s) do iPhone</Button>
        ) : null}
        {busy ? <span className="self-center text-sm text-fg-muted">{busy}</span> : null}
      </div>
      {error ? <Alert>{error}</Alert> : null}

      {images.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className={cn("group relative overflow-hidden rounded-lg border bg-muted", img.is_primary ? "border-brand ring-2 ring-brand" : "border-border")}>
              <button type="button" className="block aspect-[4/3] w-full" onClick={() => setLightbox(i)} aria-label={`Abrir foto ${i + 1}`}>
                {img.url ? <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
              </button>
              {img.is_primary ? <span className="absolute left-1 top-1 rounded bg-brand px-1.5 py-0.5 text-[10px] font-medium text-white">Principal</span> : null}
              <div className="flex items-center justify-between gap-1 bg-surface/95 p-1">
                <div className="flex">
                  <IconBtn label="Mover para trás" disabled={pending || i === 0} onClick={() => act(() => moveImage(img.id, -1))}><ChevronLeft className="h-4 w-4" /></IconBtn>
                  <IconBtn label="Mover para frente" disabled={pending || i === images.length - 1} onClick={() => act(() => moveImage(img.id, 1))}><ChevronRight className="h-4 w-4" /></IconBtn>
                </div>
                <div className="flex">
                  {!img.is_primary ? <IconBtn label="Definir como principal" disabled={pending} onClick={() => act(() => setPrimaryImage(img.id))}><Star className="h-4 w-4" /></IconBtn> : null}
                  <DeleteImageBtn disabled={pending} onConfirm={() => act(() => deleteImage(img.id))} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">Nenhuma foto ainda.</p>
      )}

      {lightbox !== null && images[lightbox] ? (
        <Lightbox images={images} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
      ) : null}
    </div>
  );
}

function IconBtn({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className="rounded p-1.5 text-fg-muted hover:bg-muted hover:text-fg disabled:opacity-30" {...props}>
      {children}
    </button>
  );
}

function DeleteImageBtn({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return armed ? (
    <button type="button" disabled={disabled} onClick={onConfirm} className="rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white">Excluir?</button>
  ) : (
    <IconBtn label="Excluir foto" disabled={disabled} onClick={() => setArmed(true)}><Trash2 className="h-4 w-4" /></IconBtn>
  );
}

export function Lightbox({ images, index, onIndex, onClose }: { images: { url?: string }[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const prev = useCallback(() => onIndex((index - 1 + images.length) % images.length), [index, images.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % images.length), [index, images.length, onIndex]);
  const touch = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowLeft") prev(); if (e.key === "ArrowRight") next(); };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose, prev, next]);
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => { if (touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 50) (dx > 0 ? prev : next)(); touch.current = null; }}>
      <img src={images[index].url} alt="" className="max-h-full max-w-full object-contain" />
      <button type="button" onClick={onClose} aria-label="Fechar" className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white"><X className="h-6 w-6" /></button>
      {images.length > 1 ? (
        <>
          <button type="button" onClick={prev} aria-label="Anterior" className="absolute left-2 rounded-full bg-white/10 p-2 text-white"><ChevronLeft className="h-6 w-6" /></button>
          <button type="button" onClick={next} aria-label="Próxima" className="absolute right-2 rounded-full bg-white/10 p-2 text-white"><ChevronRight className="h-6 w-6" /></button>
          <div className="absolute bottom-4 text-sm text-white/80">{index + 1} / {images.length}</div>
        </>
      ) : null}
    </div>
  );
}
