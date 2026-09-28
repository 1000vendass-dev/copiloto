import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/layout/pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Copiloto", template: "%s · Copiloto" },
  description: "Operação comercial de veículos: CRM, estoque, agenda e assistente de IA.",
  applicationName: "Copiloto",
  appleWebApp: { capable: true, title: "Copiloto", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f16" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
