/**
 * Classificação do lead (a temperatura quente/morno/frio é a classificação oficial; aqui está o MOTIVO por trás dela):
 * quem é comprador de verdade e quem é ruído.
 * Regra em código (determinística, sem IA): a IA só entrega a INTENÇÃO lida na conversa; o resto vem de fatos
 * mensuráveis (quem respondeu, quando, quantas vezes ficou sem resposta). Roda para TODOS os leads toda noite,
 * então um lead "quente" de 18 dias atrás que nunca mais respondeu deixa de parecer comprador.
 *
 *   comprador_real  (QUENTE) respondeu nos últimos 3 dias E a intenção lida é forte (quer comprar e tem condição viável)
 *   potencial       (MORNO) respondeu, mas com intenção média/fraca; ou ainda aguardando a 1ª resposta (menos de 48h)
 *   reativar        (MORNO) já teve intenção/etapa avançada, mas está sem responder (esfriou): é trabalho de reativação
 *   ruido           (FRIO) nunca respondeu após 48h, não tem intenção ou condição de comprar, ou esfriou de vez
 */

export type Classe = "comprador_real" | "potencial" | "reativar" | "ruido";
export type Intencao = "forte" | "media" | "fraca" | "nenhuma";

export const CLASSES: Record<Classe, { label: string; temperature: "quente" | "morno" | "frio"; chip: string }> = {
  comprador_real: { label: "Quente · comprador real", temperature: "quente", chip: "bg-green-500/15 text-green-700 dark:text-green-400" },
  potencial: { label: "Morno · potencial", temperature: "morno", chip: "bg-brand/15 text-brand" },
  reativar: { label: "Morno · reativar", temperature: "morno", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  ruido: { label: "Frio · ruído", temperature: "frio", chip: "bg-muted-2 text-fg-muted" },
};

export type Signals = {
  stage: string;
  temperature: string | null;
  /** Da última análise da IA; null = nunca analisado. */
  intencao: Intencao | null;
  /** A IA marcou que o lead não serve (ex.: orçamento abaixo do estoque, não quer financiar nem tem entrada). */
  ruidoMotivo: string | null;
  respostas3d: number;
  ultimaDele: string | null;
  ultimaMinha: string | null;
  /** Mensagens minhas sem resposta desde a última dele. */
  semResposta: number;
  /** Primeira mensagem minha dentro da janela observada. */
  primeiraMinha: string | null;
  now?: number;
};

const H = 3600_000;
const D = 24 * H;

export function classify(s: Signals): { classe: Classe; motivo: string } {
  const now = s.now ?? Date.now();
  const respondeu = s.respostas3d > 0;
  const avancado = ["visita", "proposta", "negociacao"].includes(s.stage) || s.temperature === "quente";
  const teveIntencao = s.intencao === "forte" || s.intencao === "media";
  const diasDesdeDele = s.ultimaDele ? Math.floor((now - Date.parse(s.ultimaDele)) / D) : null;

  if (s.ruidoMotivo) return { classe: "ruido", motivo: s.ruidoMotivo };
  if (s.intencao === "nenhuma") return { classe: "ruido", motivo: "sem intenção de compra na conversa" };

  if (respondeu) {
    if (s.intencao === "forte") return { classe: "comprador_real", motivo: `respondeu nos últimos 3 dias (${s.respostas3d}) com intenção forte` };
    return { classe: "potencial", motivo: `respondeu (${s.respostas3d}), mas a intenção ainda é ${s.intencao === "media" ? "média" : "fraca ou indefinida"}` };
  }

  // não respondeu nos últimos 3 dias
  if (s.ultimaDele === null && s.ultimaMinha === null && !avancado) return { classe: "potencial", motivo: "sem conversa registrada ainda" };
  if (s.ultimaDele === null) {
    const horas = s.primeiraMinha ? (now - Date.parse(s.primeiraMinha)) / H : null;
    if (avancado) return { classe: "reativar", motivo: "etapa avançada, mas sem nenhuma resposta recente" };
    if (horas !== null && horas >= 48) return { classe: "ruido", motivo: `nunca respondeu (${s.semResposta} mensagem${s.semResposta === 1 ? "" : "s"} sem resposta há ${Math.floor(horas / 24)}+ dias)` };
    return { classe: "potencial", motivo: "aguardando a 1ª resposta (menos de 48h)" };
  }
  if (teveIntencao || avancado) {
    return { classe: "reativar", motivo: `sem responder há ${diasDesdeDele} dia${diasDesdeDele === 1 ? "" : "s"} (já teve intenção ${s.intencao ?? "e etapa avançada"})` };
  }
  if ((diasDesdeDele ?? 0) > 14) return { classe: "ruido", motivo: `esfriou: última resposta há ${diasDesdeDele} dias, sem intenção clara` };
  return { classe: "potencial", motivo: `esfriando: última resposta há ${diasDesdeDele} dia${diasDesdeDele === 1 ? "" : "s"}` };
}
