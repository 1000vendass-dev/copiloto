export const STAGES = [
  { value: "novo", label: "Novo", color: "bg-slate-500" },
  { value: "primeiro_contato", label: "Primeiro contato", color: "bg-sky-500" },
  { value: "atendimento", label: "Atendimento", color: "bg-blue-500" },
  { value: "qualificado", label: "Qualificado", color: "bg-indigo-500" },
  { value: "visita", label: "Visita", color: "bg-violet-500" },
  { value: "proposta", label: "Proposta", color: "bg-amber-500" },
  { value: "negociacao", label: "Negociação", color: "bg-orange-500" },
  { value: "venda", label: "Venda", color: "bg-green-600" },
  { value: "sem_resposta", label: "Sem resposta", color: "bg-zinc-400" },
  { value: "perdido", label: "Perdido", color: "bg-red-500" },
] as const;

export type Stage = (typeof STAGES)[number]["value"];
export const STAGE_VALUES = STAGES.map((s) => s.value) as [Stage, ...Stage[]];
export const OPEN_STAGES: Stage[] = ["novo", "primeiro_contato", "atendimento", "qualificado", "visita", "proposta", "negociacao"];
export const stageLabel = (s: string) => STAGES.find((x) => x.value === s)?.label ?? s;
export const stageColor = (s: string) => STAGES.find((x) => x.value === s)?.color ?? "bg-slate-500";

export const TEMPERATURES = [
  { value: "quente", label: "Quente", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  { value: "morno", label: "Morno", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  { value: "frio", label: "Frio", className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
] as const;
export type Temperature = (typeof TEMPERATURES)[number]["value"];
export const TEMPERATURE_VALUES = TEMPERATURES.map((t) => t.value) as [Temperature, ...Temperature[]];

export const SOURCES = ["WhatsApp", "Instagram", "Facebook", "OLX", "Webmotors", "Loja (presencial)", "Indicação", "Telefone", "Site", "Outro"];

/** Tipos que o usuário registra manualmente como contato. */
export const CONTACT_TYPES = [
  { value: "ligacao", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "visita", label: "Visita na loja" },
  { value: "test_drive", label: "Test-drive" },
  { value: "follow_up", label: "Follow-up" },
] as const;
export const CONTACT_TYPE_VALUES = CONTACT_TYPES.map((c) => c.value) as [
  (typeof CONTACT_TYPES)[number]["value"],
  ...(typeof CONTACT_TYPES)[number]["value"][],
];

export const ACTIVITY_LABELS: Record<string, string> = {
  ligacao: "Ligação", whatsapp: "WhatsApp", email: "E-mail", visita: "Visita", test_drive: "Test-drive",
  proposta: "Proposta", follow_up: "Follow-up", mudanca_etapa: "Etapa", lead_criado: "Lead criado",
  cliente_criado: "Cliente", tarefa_criada: "Tarefa", tarefa_concluida: "Tarefa concluída",
  compromisso_criado: "Agenda", nota: "Nota", venda: "Venda", perda: "Perda", sistema: "Sistema", ia: "Copiloto",
};
