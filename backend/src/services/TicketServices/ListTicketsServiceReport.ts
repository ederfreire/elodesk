/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable camelcase */
import { QueryTypes } from "sequelize";
import * as _ from "lodash";
import sequelize from "../../database";

export interface DashboardData {
  tickets: any[];
  totalTickets: any;
}

export interface Params {
  searchParam: string;
  contactId: string;
  whatsappId: string[];
  dateFrom: string;
  dateTo: string;
  status: string[];
  queueIds: number[];
  tags: number[];
  users: number[];
  userId: string;
  onlyRated: string;
  protocol?: string;
  sortBy?: string;
  sortOrder?: string;
}

export default async function ListTicketsServiceReport(
  companyId: string | number,
  params: Params,
  page: number = 1,
  pageSize: number = 20
): Promise<DashboardData> {
  const offset = (page - 1) * pageSize;

  const onlyRated = params.onlyRated === "true" ? true : false;
  let query = "";
  
  if (onlyRated) {
    query = `

  select 
	  t.id,
	  w."name" as "whatsappName",
    c."name" as "contactName",
	  u."name" as "userName",
	  q."name" as "queueName",
	  wallet_user."name" as "walletName",
	  t."lastMessage",
    t.uuid,
    t."valorVenda",
    t."motivoNaoVenda",
    t."finalizadoComVenda",
    case t.status
      when 'open' then 'ABERTO'
      when 'closed' then 'FECHADO'
      when 'pending' then 'PENDENTE'
      when 'group' then 'GRUPO'
      when 'nps' then 'NPS'
      when 'lgpd' then 'LGPD'
    end as "status",
    TO_CHAR(tt."createdAt", 'DD/MM/YYYY HH24:MI') as "createdAt",
    TO_CHAR(tt."finishedAt", 'DD/MM/YYYY HH24:MI') as "closedAt",
    coalesce((
      (date_part('day', age(coalesce(tt."ratingAt", tt."finishedAt") , tt."createdAt"))) || ' d, ' || 
      (date_part('hour', age(coalesce(tt."ratingAt", tt."finishedAt"), tt."createdAt"))) || ' hrs e ' ||
      (date_part('minutes', age(coalesce(tt."ratingAt", tt."finishedAt"), tt."createdAt"))) || ' m'
    ), '0') "supportTime",
    coalesce(ur.rate, 0) "NPS"
  from "Tickets" t
  LEFT JOIN (
        SELECT DISTINCT ON ("ticketId") *
        FROM "TicketTraking"
        WHERE "companyId" = ${companyId}
        ORDER BY "ticketId", "id" DESC
    ) tt ON t.id = tt."ticketId"
	inner join "UserRatings" ur on
   		t.id = ur."ticketId"
       and ur.rate > 0
    left join "Contacts" c on 
      t."contactId" = c.id 
    left join "ContactWallets" cw on 
      c.id = cw."contactId" and cw."companyId" = ${companyId}
    left join "Users" wallet_user on 
      cw."walletId" = wallet_user.id
    left join "Whatsapps" w on 
      t."whatsappId" = w.id 
    left join "Users" u on
      t."userId" = u.id 
    left join "Queues" q on
      t."queueId" = q.id 
  -- filterPeriod`;
  } else {
    query = `
  select 
	  t.id,
	  w."name" as "whatsappName",
    c."name" as "contactName",
	  u."name" as "userName",
	  q."name" as "queueName",
	  wallet_user."name" as "walletName",
	  t."lastMessage",
    t.uuid,
    t."valorVenda",
    t."motivoNaoVenda",
    t."finalizadoComVenda",
    case t.status
      when 'open' then 'ABERTO'
      when 'closed' then 'FECHADO'
      when 'pending' then 'PENDENTE'
      when 'group' then 'GRUPO'
      when 'nps' then 'NPS'
      when 'lgpd' then 'LGPD'
    end as "status",
    TO_CHAR(tt."createdAt", 'DD/MM/YYYY HH24:MI') as "createdAt",
    TO_CHAR(tt."finishedAt", 'DD/MM/YYYY HH24:MI') as "closedAt",
    coalesce((
      (date_part('day', age(coalesce(tt."ratingAt", tt."finishedAt") , tt."createdAt"))) || ' d, ' || 
      (date_part('hour', age(coalesce(tt."ratingAt", tt."finishedAt"), tt."createdAt"))) || ' hrs e ' ||
      (date_part('minutes', age(coalesce(tt."ratingAt", tt."finishedAt"), tt."createdAt"))) || ' m'
    ), '0') "supportTime",
    coalesce(ur.rate, 0) "NPS"
  from "Tickets" t
  LEFT JOIN (
        SELECT DISTINCT ON ("ticketId") *
        FROM "TicketTraking"
        WHERE "companyId" = ${companyId}
        ORDER BY "ticketId", "id" DESC
    ) tt ON t.id = tt."ticketId"
	left join "UserRatings" ur on
   		t.id = ur."ticketId"
    left join "Contacts" c on 
      t."contactId" = c.id 
    left join "ContactWallets" cw on 
      c.id = cw."contactId" and cw."companyId" = ${companyId}
    left join "Users" wallet_user on 
      cw."walletId" = wallet_user.id
    left join "Whatsapps" w on 
      t."whatsappId" = w.id 
    left join "Users" u on
      t."userId" = u.id 
    left join "Queues" q on
      t."queueId" = q.id 
  -- filterPeriod`;
  }
  let where = `where t."companyId" = ${companyId}`;

  if (_.has(params, "dateFrom")) {
    where += ` and t."createdAt" >= '${params.dateFrom} 00:00:00'`;
  }

  if (_.has(params, "dateTo")) {
    where += ` and t."createdAt" <= '${params.dateTo} 23:59:59'`;
  }

  if (params.whatsappId !== undefined && params.whatsappId.length > 0) {
    where += ` and t."whatsappId" in (${params.whatsappId})`;
  }
  if (params.users.length > 0) {
    where += ` and t."userId" in (${params.users})`;
  }

  if (params.queueIds.length > 0) {
    where += ` and COALESCE(t."queueId",0) in (${params.queueIds})`;
  }

  if (params.status.length > 0) {
    where += ` and t."status" in ('${params.status.join("','")}')`;
  }

  if (params.contactId !== undefined && params.contactId !== "") {
    where += ` and t."contactId" in (${params.contactId})`;
  }

  // ── Busca por protocolo ────────────────────────────────────────────────────
  //
  // O protocolo tem 14 dígitos: YYYYMMDD (8, data de abertura) + ID com 6
  // dígitos preenchidos com zero à esquerda. Ex.: 20260526000123 = 26/05/2026,
  // ticket 123.
  //
  // POR QUE TRAZIA "COISAS COM NÚMERO PARECIDO"
  //
  // A versão anterior juntava CINCO condições com OR, e três delas eram
  // `LIKE '%numero%'` — casando em qualquer posição:
  //
  //   (data||id) LIKE '%proto%'      -> pedaço em qualquer lugar do protocolo
  //   id::text   LIKE 'proto%'       -> qualquer ID QUE COMECE com os dígitos
  //   LPAD(id,6) LIKE '%proto%'      -> pedaço em qualquer lugar do ID
  //
  // Com isso, digitar o protocolo INTEIRO ainda casava por substring, e
  // digitar "123" trazia os tickets 123, 1234, 12345, 1230..., mais qualquer
  // protocolo que tivesse "123" no meio da data. Era ruído por construção.
  //
  // Agora a regra é determinística, sem `%` no meio:
  //
  //   14 dígitos      -> protocolo exato (uma linha, só ela)
  //    8 dígitos      -> todos os atendimentos daquele DIA
  //    9 a 13 dígitos -> aquele dia + ID que COMEÇA com o resto
  //    1 a  7 dígitos -> ID do atendimento, exato
  //
  // `proto` é só dígitos (o replace acima remove todo o resto), então a
  // interpolação não abre espaço para injeção de SQL.
  if (params.protocol && String(params.protocol).trim() !== "") {
    const proto = String(params.protocol).replace(/[^0-9]/g, "");
    if (proto.length > 0) {
      const fullConcat = `(TO_CHAR(t."createdAt", 'YYYYMMDD') || LPAD(t.id::text, 6, '0'))`;
      const datePart = `TO_CHAR(t."createdAt", 'YYYYMMDD')`;
      const idText = `t.id::text`;
      const idPadded = `LPAD(t.id::text, 6, '0')`;

      let condicao: string;

      if (proto.length === 14) {
        // Protocolo completo: igualdade pura.
        condicao = `${fullConcat} = '${proto}'`;
      } else if (proto.length === 8) {
        // Só a data: o dia inteiro.
        condicao = `${datePart} = '${proto}'`;
      } else if (proto.length > 8) {
        // Data completa + começo do ID.
        const dia = proto.slice(0, 8);
        const inicioDoId = proto.slice(8);
        condicao =
          `${datePart} = '${dia}' and ` +
          `(${idPadded} like '${inicioDoId}%' or ${idText} like '${inicioDoId}%')`;
      } else {
        // Menos de 8 dígitos: é o número do atendimento, não data. Exato —
        // é isso que evita o "12" trazer 12, 120, 1234...
        condicao = `${idText} = '${proto}'`;
      }

      where += ` and (${condicao})`;
    }
  }

  if (params.onlyRated === "true") {
    query += ` and coalesce(ur.rate, 0) > 0`;
  }

  const finalQuery = query.replace("-- filterPeriod", where);

  const totalTicketsQuery = `
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE t."status" = 'open') as "totalOpen",
      COUNT(*) FILTER (WHERE t."status" = 'pending') as "totalPending",
      COUNT(*) FILTER (WHERE t."status" = 'closed') as "totalClosed",
      COUNT(*) FILTER (WHERE t."status" = 'group') as "totalGroup"
    FROM "Tickets" t
    ${where}  `;

  const totalTicketsResult = await sequelize.query(totalTicketsQuery, {
    type: QueryTypes.SELECT
  });
  const totalTickets = totalTicketsResult[0];

  const sortOrder =
    String(params.sortOrder || "").toLowerCase() === "asc" ? "ASC" : "DESC";

  let orderClause = `t."createdAt" ${sortOrder}`;
  if (params.sortBy === "protocol") {
    // Protocolo = YYYYMMDD + LPAD(id,6). Ordenar por data e depois id mantém a mesma ordem
    // lexicográfica do protocolo, sem custo de concatenação.
    orderClause = `t."createdAt" ${sortOrder}, t.id ${sortOrder}`;
  }

  const paginatedQuery = `${finalQuery} ORDER BY ${orderClause} LIMIT ${pageSize} OFFSET ${offset}`;

  const responseData: any[] = await sequelize.query(paginatedQuery, {
    type: QueryTypes.SELECT
  });

  return { tickets: responseData, totalTickets };
}
