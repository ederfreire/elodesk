import { QueryTypes } from "sequelize";
import sequelize from "../../database";

/**
 * Totais de mensagens enviadas e recebidas por conexao, nos ultimos 7 dias.
 *
 * DECISAO: uma consulta so para TODAS as conexoes da empresa, nao uma por
 * card. A tela de conexoes costuma ter dezenas de cards; um endpoint por
 * card viraria dezenas de requisicoes simultaneas a cada carregamento, cada
 * uma varrendo a tabela Messages.
 *
 * O vinculo com a conexao vem do Ticket: a tabela Messages nao tem
 * whatsappId, entao o JOIN com Tickets e obrigatorio.
 */

export interface DiaEstatistica {
  dia: string; // AAAA-MM-DD
  enviadas: number;
  recebidas: number;
}

export interface EstatisticaConexao {
  whatsappId: number;
  totalEnviadas: number;
  totalRecebidas: number;
  dias: DiaEstatistica[];
}

interface Linha {
  whatsappId: number;
  dia: string;
  enviadas: string;
  recebidas: string;
}

const ListConnectionStatsService = async (
  companyId: number
): Promise<EstatisticaConexao[]> => {
  const linhas = await sequelize.query<Linha>(
    `
    SELECT
      t."whatsappId"                                AS "whatsappId",
      to_char(date_trunc('day', m."createdAt"), 'YYYY-MM-DD') AS "dia",
      COUNT(*) FILTER (WHERE m."fromMe" IS TRUE)    AS "enviadas",
      COUNT(*) FILTER (WHERE m."fromMe" IS NOT TRUE) AS "recebidas"
    FROM "Messages" m
    INNER JOIN "Tickets" t ON t."id" = m."ticketId"
    WHERE m."companyId" = :companyId
      AND t."whatsappId" IS NOT NULL
      AND m."createdAt" >= date_trunc('day', NOW()) - INTERVAL '6 days'
    GROUP BY t."whatsappId", date_trunc('day', m."createdAt")
    `,
    {
      replacements: { companyId },
      type: QueryTypes.SELECT
    }
  );

  // Os 7 dias sempre existem no resultado, mesmo com zero mensagens. Sem
  // preencher os buracos o grafico ficaria com o eixo irregular e um dia
  // parado pareceria um dia inexistente.
  const hoje = new Date();
  const chavesDeDia: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    chavesDeDia.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    );
  }

  const porConexao = new Map<number, Map<string, DiaEstatistica>>();

  linhas.forEach(linha => {
    const id = Number(linha.whatsappId);
    if (!porConexao.has(id)) porConexao.set(id, new Map());
    porConexao.get(id)?.set(linha.dia, {
      dia: linha.dia,
      enviadas: Number(linha.enviadas) || 0,
      recebidas: Number(linha.recebidas) || 0
    });
  });

  const saida: EstatisticaConexao[] = [];

  porConexao.forEach((mapaDeDias, whatsappId) => {
    const dias = chavesDeDia.map(
      dia => mapaDeDias.get(dia) || { dia, enviadas: 0, recebidas: 0 }
    );

    saida.push({
      whatsappId,
      totalEnviadas: dias.reduce((soma, d) => soma + d.enviadas, 0),
      totalRecebidas: dias.reduce((soma, d) => soma + d.recebidas, 0),
      dias
    });
  });

  return saida;
};

export default ListConnectionStatsService;
