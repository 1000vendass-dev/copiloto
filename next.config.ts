import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Docker/VPS: gera servidor autônomo. Na Vercel a variável não existe e nada muda.
  ...(process.env.BUILD_STANDALONE ? { output: "standalone" as const } : {}),
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
