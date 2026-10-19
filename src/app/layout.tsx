import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { PwaRegister } from "@/components/layout/pwa";
import { ACCENT_COOKIE, THEME_COLOR, THEME_COOKIE, parseAccent, parseTheme } from "@/lib/appearance";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "Copiloto", template: "%s · Copiloto" },
  description: "Operação comercial de veículos: CRM, estoque, agenda e assistente de IA.",
  applicationName: "Copiloto",
  appleWebApp: { capable: true, title: "Copiloto", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

/** Cor da barra do celular acompanha o tema escolhido (ou o do celular, no automático). */
export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: theme === "auto"
      ? [
        { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
        { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
      ]
      : THEME_COLOR[theme],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const accent = parseAccent(jar.get(ACCENT_COOKIE)?.value);
  return (
    <html lang="pt-BR" className={inter.variable} data-theme={theme === "auto" ? undefined : theme} data-accent={accent}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
