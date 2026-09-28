import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Copiloto de Vendas",
    short_name: "Copiloto",
    description: "CRM, estoque, agenda e assistente de IA para venda de veículos.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f9",
    theme_color: "#2563eb",
    lang: "pt-BR",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Copiloto", url: "/copiloto", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Novo lead", url: "/leads/novo", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Estoque", url: "/estoque", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
