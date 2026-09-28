/** Tipos das linhas do banco usados pela UI (subconjunto das colunas). */
export type Lead = {
  id: string;
  team_id: string;
  owner_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  stage: string;
  temperature: string | null;
  interest: string | null;
  budget_max: number | null;
  payment_method: string | null;
  trade_in: string | null;
  purchase_timeframe: string | null;
  next_action: string | null;
  next_action_at: string | null;
  last_contact_at: string | null;
  lost_reason: string | null;
  closed_value: number | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  team_id: string;
  owner_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  city: string | null;
  notes: string | null;
  created_at: string;
};

export type Activity = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  occurred_at: string;
  lead_id: string | null;
  customer_id: string | null;
  metadata: Record<string, unknown>;
};

export type Note = { id: string; content: string; created_at: string; owner_id: string | null };

export type Task = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: "pendente" | "concluida" | "cancelada";
  priority: "baixa" | "media" | "alta";
  lead_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  completed_at: string | null;
};

export type Tag = { id: string; name: string; color: string | null };

export type Vehicle = {
  id: string;
  team_id: string;
  owner_id: string | null;
  stock_code: string | null;
  category: string;
  brand: string;
  model: string;
  version: string | null;
  year_manufacture: number | null;
  year_model: number | null;
  km: number | null;
  color: string | null;
  fuel: string | null;
  transmission: string | null;
  engine: string | null;
  doors: number | null;
  body_type: string | null;
  plate: string | null;
  purchase_price: number | null;
  sale_price: number | null;
  status: "disponivel" | "reservado" | "vendido" | "inativo";
  store: string | null;
  description: string | null;
  entry_date: string | null;
  reserved_lead_id: string | null;
  sold_lead_id: string | null;
  sold_at: string | null;
  sold_price: number | null;
  created_at: string;
  updated_at: string;
};

export type VehicleImage = { id: string; vehicle_id: string; storage_path: string; position: number; is_primary: boolean; url?: string };
