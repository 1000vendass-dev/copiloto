import "server-only";

/**
 * Quadro de tarefas da empresa de agentes (fora do Supabase: banco empresa-db na VPS).
 * No quadro, o chat do Copiloto é o CSO (Diretor Comercial). A chave QUADRO_API_TOKEN define o cargo;
 * as travas (não apagar, não decidir aprovação, tarefa só desce na hierarquia) ficam do lado do quadro.
 * Não confundir com create_task/search_tasks: essas são lembretes de clientes dentro do CRM.
 */

type Json = Record<string, unknown>;

/** `token`: a chave define quem age. Padrão = CSO (o chat); as rotinas da equipe usam a chave do próprio cargo. */
export async function chamaQuadro(comando: string, args: string[] = [], opcoes: Json = {}, token = process.env.QUADRO_API_TOKEN): Promise<Json> {
  const url = process.env.QUADRO_API_URL;
  if (!url || !token) return { ok: false, error: "O quadro da empresa não está configurado neste servidor (QUADRO_API_URL/QUADRO_API_TOKEN)." };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ comando, args, opcoes }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) return { ok: false, error: String(body.erro ?? `quadro respondeu ${res.status}`) };
    return body.ok === false ? { ok: false, error: String(body.erro ?? "recusado pelo quadro") } : body;
  } catch {
    return { ok: false, error: "Não consegui falar com o quadro da empresa (container empresa-ceo)." };
  }
}

const s = (v: unknown, max = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const id = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) > 0 ? String(Number(v)) : undefined);
/** só leva as opções preenchidas (o quadro trata ausência como "não informado") */
const opcoes = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export const QUADRO_TOOLS = [
  {
    name: "quadro_consultar",
    description:
      "Consulta o QUADRO DA EMPRESA (tarefas entre cargos da empresa de agentes: ordens do CEO, trabalho do Comercial e da sua equipe, aprovações do dono). " +
      "o_que: resumo (visão geral) · minhas_tarefas (do CSO e da equipe comercial) · tarefa (detalhe + histórico, exige id) · aprovacoes (pedidos pendentes) · cargos (organograma ativo).",
    input_schema: {
      type: "object", required: ["o_que"],
      properties: { o_que: { type: "string", enum: ["resumo", "minhas_tarefas", "tarefa", "aprovacoes", "cargos"] }, id: { type: "integer" } },
    },
    run: async (a: Json) => {
      switch (a.o_que) {
        case "resumo": return chamaQuadro("resumo");
        case "minhas_tarefas": {
          const equipe = ["cso", "sdr", "follow_up", "pos_venda", "closer"];
          const listas = await Promise.all(equipe.map((r) => chamaQuadro("tarefas", [], { responsavel: r })));
          const erro = listas.find((l) => l.ok === false);
          if (erro) return erro;
          return { ok: true, tarefas: listas.flatMap((l) => (Array.isArray(l.itens) ? l.itens : [])) };
        }
        case "tarefa": return id(a.id) ? chamaQuadro("tarefa", [id(a.id)!]) : { ok: false, error: "Informe o id da tarefa." };
        case "aprovacoes": return chamaQuadro("aprovacoes");
        case "cargos": return chamaQuadro("cargos");
        default: return { ok: false, error: "o_que inválido." };
      }
    },
  },
  {
    name: "quadro_agir",
    description:
      "Registra no QUADRO DA EMPRESA. acao: criar (tarefa para você mesmo ou para a sua equipe: sdr, follow_up, pos_venda; closer = o dono) · " +
      "status (muda status de uma tarefa) · entregar (registra a entrega e manda para revisão) · pedir_aprovacao (leva uma decisão ao dono). " +
      "Status: nova, em_andamento, em_revisao, aguardando_aprovacao, concluida, bloqueada, cancelada. Prazo em ISO com fuso (-03:00). " +
      "Tarefa com prazo vencido só anda com motivo_atraso.",
    input_schema: {
      type: "object", required: ["acao"],
      properties: {
        acao: { type: "string", enum: ["criar", "status", "entregar", "pedir_aprovacao"] },
        id: { type: "integer", description: "tarefa (status/entregar) ou tarefa ligada (pedir_aprovacao)" },
        titulo: { type: "string" }, descricao: { type: "string", description: "o que fazer e o critério de pronto" },
        responsavel: { type: "string", enum: ["cso", "sdr", "follow_up", "pos_venda", "closer"] },
        prazo: { type: "string" }, prioridade: { type: "string", enum: ["urgente", "alta", "normal", "baixa"] },
        pedido_pelo_dono: { type: "boolean", description: "true quando a tarefa é uma ordem do dono feita aqui no chat" },
        status: { type: "string", enum: ["nova", "em_andamento", "em_revisao", "aguardando_aprovacao", "concluida", "bloqueada", "cancelada"] },
        comentario: { type: "string" }, motivo_atraso: { type: "string" }, entrega: { type: "string" },
        assunto: { type: "string" }, categoria: { type: "string", enum: ["cliente", "dinheiro", "sistemas", "outro"] },
        recomendacao: { type: "string" },
      },
    },
    run: async (a: Json) => {
      switch (a.acao) {
        case "criar":
          return chamaQuadro("criar", [], opcoes({
            titulo: s(a.titulo, 200), descricao: s(a.descricao), responsavel: s(a.responsavel, 40), prazo: s(a.prazo, 40),
            prioridade: s(a.prioridade, 20), "pedido-por": a.pedido_pelo_dono === true ? "dono" : undefined,
          }));
        case "status":
          if (!id(a.id) || !s(a.status)) return { ok: false, error: "Informe id e status." };
          return chamaQuadro("status", [id(a.id)!, s(a.status)!], opcoes({ comentario: s(a.comentario), "motivo-atraso": s(a.motivo_atraso) }));
        case "entregar":
          if (!id(a.id) || !s(a.entrega)) return { ok: false, error: "Informe id e entrega." };
          return chamaQuadro("entregar", [id(a.id)!], opcoes({ entrega: s(a.entrega), comentario: s(a.comentario) }));
        case "pedir_aprovacao":
          return chamaQuadro("pedir-aprovacao", [], opcoes({
            assunto: s(a.assunto, 300), categoria: s(a.categoria, 20), recomendacao: s(a.recomendacao), tarefa: id(a.id),
          }));
        default: return { ok: false, error: "acao inválida." };
      }
    },
  },
];
