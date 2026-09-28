import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { PublicGallery } from "@/features/shares/public-gallery";
import { bodyLabel, transmissionLabel, IMAGE_BUCKET } from "@/features/inventory/constants";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Shared = {
  vehicle: { brand: string; model: string; version: string | null; year_manufacture: number | null; year_model: number | null; km: number | null;
    color: string | null; fuel: string | null; transmission: string | null; engine: string | null; doors: number | null; body_type: string | null;
    store: string | null; description: string | null; status: string };
  price: number | null; message: string | null; expires_at: string;
  seller: { name: string | null; phone: string | null; team: string | null } | null;
  features: string[]; images: string[];
};

/** Uma leitura por requisição (a função conta visualizações). */
const load = cache(async (token: string) => {
  if (!/^[0-9a-f]{32}$/i.test(token)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_shared_vehicle", { p_token: token });
  if (!data) return null;
  const s = data as Shared;
  let urls: string[] = [];
  if (s.images.length) {
    const { data: signed } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(s.images, 7 * 86400);
    urls = (signed ?? []).map((x) => x.signedUrl).filter((u): u is string => Boolean(u));
  }
  return { ...s, urls };
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const title = (s: Shared) => `${s.vehicle.brand} ${s.vehicle.model} ${s.vehicle.year_model ?? ""}`.trim();

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const s = await load(token);
  if (!s) return { title: "Ficha indisponível", robots: { index: false } };
  const desc = [s.vehicle.version, s.price ? brl(s.price) : null, s.vehicle.km != null ? `${s.vehicle.km.toLocaleString("pt-BR")} km` : null].filter(Boolean).join(" · ");
  return {
    title: { absolute: title(s) },
    description: desc,
    robots: { index: false, follow: false },
    openGraph: { title: title(s), description: desc, images: s.urls[0] ? [{ url: s.urls[0] }] : undefined, type: "website" },
  };
}

export default async function FichaPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await load(token);
  if (!s) notFound();
  const v = s.vehicle;
  const sold = v.status === "vendido";
  const specs: [string, string | null][] = [
    ["Ano", v.year_manufacture && v.year_model ? `${v.year_manufacture}/${v.year_model}` : v.year_model ? String(v.year_model) : null],
    ["Km", v.km != null ? v.km.toLocaleString("pt-BR") : null],
    ["Câmbio", v.transmission ? transmissionLabel(v.transmission) : null],
    ["Combustível", v.fuel ? v.fuel[0].toUpperCase() + v.fuel.slice(1) : null],
    ["Motor", v.engine],
    ["Cor", v.color],
    ["Carroceria", v.body_type && v.body_type !== "moto" ? bodyLabel(v.body_type) : null],
    ["Portas", v.doors ? String(v.doors) : null],
  ];
  const sellerPhone = s.seller?.phone?.replace(/\D/g, "");
  const wa = sellerPhone
    ? `https://wa.me/${sellerPhone.length <= 11 ? "55" + sellerPhone : sellerPhone}?text=${encodeURIComponent(`Olá${s.seller?.name ? ", " + s.seller.name.split(" ")[0] : ""}! Vi a ficha do ${title(s)} e tenho interesse.`)}`
    : null;

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 pb-28 pt-4">
      <header className="mb-3 text-center text-sm font-medium text-fg-muted">{s.seller?.team ?? v.store ?? ""}</header>
      <PublicGallery urls={s.urls} alt={title(s)} />
      <section className="mt-4">
        <h1 className="text-2xl font-bold leading-tight">{v.brand} {v.model}</h1>
        {v.version ? <p className="text-fg-muted">{v.version}</p> : null}
        {sold ? (
          <p className="mt-3 inline-block rounded-full bg-muted px-3 py-1 text-sm font-medium">Este veículo já foi vendido</p>
        ) : s.price ? (
          <p className="mt-3 text-3xl font-bold tabular-nums text-brand">{brl(s.price)}</p>
        ) : (
          <p className="mt-3 text-lg font-medium">Consulte condições</p>
        )}
      </section>

      {s.message ? (
        <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <p className="whitespace-pre-line">{s.message}</p>
          {s.seller?.name ? <p className="mt-2 text-sm text-fg-muted">— {s.seller.name}</p> : null}
        </section>
      ) : null}

      <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-3 font-semibold">Ficha técnica</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {specs.filter(([, val]) => val).map(([k, val]) => (
            <div key={k}><dt className="text-xs text-fg-muted">{k}</dt><dd className="font-medium">{val}</dd></div>
          ))}
        </dl>
      </section>

      {s.features.length ? (
        <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-3 font-semibold">Opcionais</h2>
          <ul className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
            {s.features.map((f) => <li key={f} className="flex gap-2"><span className="text-brand">✓</span>{f}</li>)}
          </ul>
        </section>
      ) : null}

      {v.description ? (
        <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-2 font-semibold">Observações</h2>
          <p className="whitespace-pre-line text-sm">{v.description}</p>
        </section>
      ) : null}

      <p className="mt-6 text-center text-xs text-fg-muted">
        Condições válidas até {new Date(s.expires_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Sujeito à disponibilidade.
      </p>

      {wa && !sold ? (
        <div className="pb-safe fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 p-3 backdrop-blur">
          <a href={wa} target="_blank" rel="noopener noreferrer"
            className="mx-auto flex max-w-2xl items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3.5 font-semibold text-white hover:bg-green-700">
            <MessageCircle className="h-5 w-5" /> Falar com {s.seller?.name?.split(" ")[0] ?? "o vendedor"} no WhatsApp
          </a>
        </div>
      ) : null}
    </div>
  );
}
