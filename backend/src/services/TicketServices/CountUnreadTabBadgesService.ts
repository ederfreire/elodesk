import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import ShowUserService from "../UserServices/ShowUserService";

/**
 * Contagem de tickets nao lidos para os BADGES DAS ABAS (Aguardando e Grupos)
 * da tela de atendimentos.
 *
 * NAO CONFUNDIR com o CountUnreadTicketsService, que fica no mesmo diretorio
 * e serve a outra coisa: aquele conta CONVERSAS visiveis para um atendente e
 * alimenta o badge do icone do app (navigator.setAppBadge) no push. Este aqui
 * devolve DOIS numeros — pendentes e grupos — para as abas.
 *
 * POR QUE ISSO EXISTE
 * O frontend contava isso paginando `/tickets?withUnreadMessages=true` até 10
 * páginas — ou seja, baixava até 400 tickets COMPLETOS, cada um com contato,
 * tags, fila, conexão e carteiras, para no fim usar só `length`. Eram 3 a 10
 * requisições pesadas por carregamento de tela, e todo o custo de montar os
 * objetos no Sequelize e serializar para JSON era jogado fora.
 *
 * Aqui a contagem é feita no banco e volta como dois números.
 */

interface Params {
  companyId: number;
  userId: number;
}

interface Contagens {
  pending: number;
  group: number;
}

const CountUnreadTabBadgesService = async ({
  companyId,
  userId
}: Params): Promise<Contagens> => {
  // As filas saem do PROPRIO usuario, como no ListTicketsService — e nao de
  // parametros da URL.
  //
  // Isso nao e detalhe de estilo: o efeito que chama este endpoint no
  // frontend tem deps [user.companyId, socket]. Se os filtros viessem por
  // query, a closure guardaria o valor da primeira renderizacao e o badge
  // ficaria errado assim que o operador trocasse de fila ou ligasse "ver
  // todos". Resolvendo no servidor, esse problema deixa de existir.
  //
  // Tambem reproduz o comportamento anterior: o codigo que paginava nao
  // enviava queueIds nem showAll, entao o backend ja decidia pelo token.
  const user = await ShowUserService(userId, companyId);
  const queueIds = (user?.queues || []).map((fila: any) => fila.id);
  const showAll = user?.profile === "admin" || ["enable", "enabled"].includes(String(user?.allTicket || ""));

  // Lista de filas vazia significa "sem filtro" — mesma regra do
  // ListTicketsService. `queueId IN (NULL)` não casa com nada no Postgres.
  const temFiltroDeFila = Array.isArray(queueIds) && queueIds.length > 0;

  const filtroFila = temFiltroDeFila
    ? `AND (t."queueId" IN (:queueIds) OR t."queueId" IS NULL)`
    : "";

  const filtroUsuario = showAll
    ? ""
    : `AND (t."userId" = :userId OR t."userId" IS NULL)`;

  const [linha]: any[] = await sequelize.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE t."status" = 'pending'
          AND COALESCE(t."isGroup", FALSE) = FALSE
          AND COALESCE(c."isGroup", FALSE) = FALSE
      ) AS "pending",
      COUNT(*) FILTER (
        WHERE COALESCE(t."isGroup", FALSE) = TRUE
           OR COALESCE(c."isGroup", FALSE) = TRUE
      ) AS "group"
    FROM "Tickets" t
    LEFT JOIN "Contacts" c ON c."id" = t."contactId"
    WHERE t."companyId" = :companyId
      AND t."unreadMessages" > 0
      AND t."status" NOT IN ('closed', 'lgpd', 'nps', 'chatbot')
      ${filtroFila}
      ${filtroUsuario}
    `,
    {
      replacements: {
        companyId,
        userId,
        ...(temFiltroDeFila ? { queueIds } : {})
      },
      type: QueryTypes.SELECT
    }
  );

  return {
    pending: Number(linha?.pending) || 0,
    group: Number(linha?.group) || 0
  };
};

export default CountUnreadTabBadgesService;
