/* eslint-disable camelcase */
import { QueryTypes } from "sequelize";
import * as _ from "lodash";
import sequelize from "../../database";

export interface ClosingReportData {
  tickets: any[];
  totalTickets: any;
}

export interface ClosingReportParams {
  dateFrom?: string;
  dateTo?: string;
  status?: string[];
  queueIds?: number[];
  users?: number[];
  closingSubject?: string;
}

export default async function ListClosingReportService(
  companyId: string | number,
  params: ClosingReportParams,
  page: number = 1,
  pageSize: number = 9999999
): Promise<ClosingReportData> {
  const offset = (page - 1) * pageSize;

  let where = `where t."companyId" = ${companyId}`;

  if (params.dateFrom) {
    where += ` and t."createdAt" >= '${params.dateFrom} 00:00:00'`;
  }

  if (params.dateTo) {
    where += ` and t."createdAt" <= '${params.dateTo} 23:59:59'`;
  }

  if (params.users && params.users.length > 0) {
    where += ` and t."userId" in (${params.users.join(",")})`;
  }

  if (params.queueIds && params.queueIds.length > 0) {
    where += ` and COALESCE(t."queueId",0) in (${params.queueIds.join(",")})`;
  }

  if (params.status && params.status.length > 0) {
    where += ` and t."status" in ('${params.status.join("','")}')`;
  }

  if (params.closingSubject && String(params.closingSubject).trim() !== "") {
    const subject = String(params.closingSubject).replace(/'/g, "''");
    where += ` and coalesce(nullif(t."closingSubject", ''), nullif(t."motivoFinalizacao", '')) = '${subject}'`;
  }

  const baseQuery = `
    select
      t.id,
      t.uuid,
      c."name" as "contactName",
      u."name" as "userName",
      q."name" as "queueName",
      w."name" as "whatsappName",
      -- Assunto efetivo: quando o atendente encerrou pela tela de venda
      -- (valor/motivo) e não preencheu o assunto, o relatório mostrava "-".
      -- O motivo é a informação que a operação realmente registra, então ele
      -- entra como assunto quando o campo próprio está vazio.
      coalesce(nullif(t."closingSubject", ''), nullif(t."motivoFinalizacao", '')) as "closingSubject",
      t."closingSummary",
      case t.status
        when 'open' then 'ABERTO'
        when 'closed' then 'FECHADO'
        when 'pending' then 'PENDENTE'
        when 'group' then 'GRUPO'
        when 'nps' then 'NPS'
        when 'lgpd' then 'LGPD'
      end as "status",
      TO_CHAR(tt."createdAt", 'DD/MM/YYYY HH24:MI') as "openDate",
      TO_CHAR(tt."finishedAt", 'DD/MM/YYYY HH24:MI') as "closeDate",
      coalesce((
        (date_part('day', age(coalesce(tt."finishedAt", now()), tt."createdAt"))) || 'd ' ||
        (date_part('hour', age(coalesce(tt."finishedAt", now()), tt."createdAt"))) || 'h ' ||
        (date_part('minutes', age(coalesce(tt."finishedAt", now()), tt."createdAt"))) || 'min'
      ), '-') as "supportTime"
    from "Tickets" t
    LEFT JOIN (
      SELECT DISTINCT ON ("ticketId") *
      FROM "TicketTraking"
      WHERE "companyId" = ${companyId}
      ORDER BY "ticketId", "id" DESC
    ) tt ON t.id = tt."ticketId"
    left join "Contacts" c on t."contactId" = c.id
    left join "Users" u on t."userId" = u.id
    left join "Queues" q on t."queueId" = q.id
    left join "Whatsapps" w on t."whatsappId" = w.id
    ${where}
    ORDER BY t."createdAt" DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const tickets: any[] = await sequelize.query(baseQuery, {
    type: QueryTypes.SELECT
  });

  const totalQuery = `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE t."status" = 'open') as "totalOpen",
      COUNT(*) FILTER (WHERE t."status" = 'pending') as "totalPending",
      COUNT(*) FILTER (WHERE t."status" = 'closed') as "totalClosed",
      COUNT(*) FILTER (WHERE t."status" = 'group') as "totalGroup"
    FROM "Tickets" t
    ${where}
  `;

  const totalResult = await sequelize.query(totalQuery, {
    type: QueryTypes.SELECT
  });

  return { tickets, totalTickets: totalResult[0] };
}
