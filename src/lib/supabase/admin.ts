import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com permissão de servidor (ignora RLS). Usar SOMENTE no webhook do WhatsApp
 * e nas ações de envio, que validam a sessão do usuário antes. Nunca expor ao navegador.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente. Veja .env.example.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
