import "server-only";

import { chamaQuadro } from "@/features/ai/quadro";

/**
 * Ciclo de melhoria dos agentes da equipe comercial (empresa de agentes): cada agente propõe ajustes nas
 * próprias instruções no feedback do dia ("Instrução para <cargo>: ..."), o dono aprova ou recusa na página
 * do CEO, e o que foi APROVADO volta para o prompt do agente nas próximas rodadas.
 */

export const PREFIXO = (cargo: string) => `Instrução para ${cargo}: `;

type Aprovacao = { assunto?: string; status?: string; solicitado_por?: string; recomendacao?: string | null; decidido_em?: string | null };

/** Instruções aprovadas pelo dono para este cargo (as mais novas primeiro, no máximo 12). */
export async function aprendizadosAprovados(cargo: string, token: string | undefined): Promise<string[]> {
  if (!token) return [];
  const r = await chamaQuadro("aprovacoes", [], { todas: true }, token);
  const itens = (Array.isArray(r.itens) ? r.itens : []) as Aprovacao[];
  return itens
    .filter((a) => a.status === "aprovada" && a.solicitado_por === cargo && a.assunto?.startsWith(PREFIXO(cargo)))
    .slice(0, 12)
    .map((a) => a.assunto!.slice(PREFIXO(cargo).length).trim());
}

export function blocoAprendizados(itens: string[]): string {
  return itens.length ? `APRENDIZADOS APROVADOS PELO DONO (valem como instrução sua, acima do seu jeito padrão):\n${itens.map((i) => `• ${i}`).join("\n")}` : "";
}

/** Pede ao dono para aprovar um ajuste (não repete pedido igual que ainda está pendente). */
export async function proporAjuste(cargo: string, token: string | undefined, texto: string, motivo: string, tarefa?: string | null) {
  if (!token) return;
  const assunto = `${PREFIXO(cargo)}${texto}`.slice(0, 300);
  const r = await chamaQuadro("aprovacoes", [], {}, token);
  const pendentes = (Array.isArray(r.itens) ? r.itens : []) as Aprovacao[];
  if (pendentes.some((a) => a.assunto === assunto)) return;
  await chamaQuadro("pedir-aprovacao", [], { assunto, categoria: "outro", recomendacao: motivo.slice(0, 500), ...(tarefa ? { tarefa } : {}) }, token);
}
