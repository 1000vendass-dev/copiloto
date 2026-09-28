import "server-only";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STAGES } from "@/features/crm/constants";

export async function openLeadOptions() {
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("id,name").in("stage", OPEN_STAGES).order("name").limit(1000);
  return data ?? [];
}
