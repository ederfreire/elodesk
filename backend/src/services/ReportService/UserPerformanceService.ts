import sequelize from "../../database/index";
import { QueryTypes } from "sequelize";

interface Request {
  initialDate: string;
  finalDate: string;
  companyId: number;
}

interface UserPerformance {
  userId: number;
  userName: string;
  online: boolean;
  totalTickets: number;
  openTickets: number;
  pendingTickets: number;
  closedTickets: number;
  avgSupportTime: number;
  avgWaitTime: number;
  minSupportTime: number;
  maxSupportTime: number;
  avgRating: number;
  totalRatings: number;
  npsScore: number;
  firstResponseAvg: number;
  ticketsByDay: { date: string; total: number }[];
}

interface Return {
  data: UserPerformance[];
  summary: {
    totalTickets: number;
    totalUsers: number;
    avgSupportTime: number;
    avgWaitTime: number;
    avgRating: number;
  };
}

export const UserPerformanceService = async ({
  initialDate,
  finalDate,
  companyId,
}: Request): Promise<Return> => {
  // Main user performance query
  const sql = `
    WITH user_tickets AS (
      SELECT
        u.id AS "userId",
        u.name AS "userName",
        u.online,
        COUNT(DISTINCT tt.id) AS "totalTickets",
        COUNT(DISTINCT CASE WHEN t.status = 'open' THEN t.id END) AS "openTickets",
        COUNT(DISTINCT CASE WHEN t.status = 'pending' THEN t.id END) AS "pendingTickets",
        COUNT(DISTINCT CASE WHEN t.status = 'closed' THEN t.id END) AS "closedTickets",
        COALESCE(AVG(
          CASE WHEN tt."closedAt" IS NOT NULL OR tt."finishedAt" IS NOT NULL THEN
            (EXTRACT(EPOCH FROM COALESCE(tt."closedAt", tt."finishedAt") - tt."startedAt") / 60)
          END
        ), 0) AS "avgSupportTime",
        COALESCE(AVG(
          CASE WHEN tt."queuedAt" IS NOT NULL THEN
            -- Espera = da fila até o atendente assumir (startedAt).
            -- tt."updatedAt" muda a cada alteração da linha e inflava a conta.
            EXTRACT(EPOCH FROM (COALESCE(tt."startedAt", now()) - tt."queuedAt")) / 60
          END
        ), 0) AS "avgWaitTime",
        COALESCE(MIN(
          CASE WHEN tt."closedAt" IS NOT NULL OR tt."finishedAt" IS NOT NULL THEN
            (EXTRACT(EPOCH FROM COALESCE(tt."closedAt", tt."finishedAt") - tt."startedAt") / 60)
          END
        ), 0) AS "minSupportTime",
        COALESCE(MAX(
          CASE WHEN tt."closedAt" IS NOT NULL OR tt."finishedAt" IS NOT NULL THEN
            (EXTRACT(EPOCH FROM COALESCE(tt."closedAt", tt."finishedAt") - tt."startedAt") / 60)
          END
        ), 0) AS "maxSupportTime",
        COALESCE(AVG(ur.rate), 0) AS "avgRating",
        COUNT(ur.id) AS "totalRatings"
      FROM "Users" u
      LEFT JOIN "TicketTraking" tt ON tt."userId" = u.id
        AND tt."companyId" = ${companyId}
        AND tt."createdAt" >= '${initialDate} 00:00:00'
        AND tt."createdAt" <= '${finalDate} 23:59:59'
      LEFT JOIN "Tickets" t ON t.id = tt."ticketId"
      LEFT JOIN "UserRatings" ur ON ur."userId" = u.id AND ur."ticketId" = t.id
      WHERE u."companyId" = ${companyId}
      GROUP BY u.id, u.name, u.online
      ORDER BY "totalTickets" DESC
    )
    SELECT * FROM user_tickets;
  `;

  // Tickets per day per user
  const sqlByDay = `
    SELECT
      u.id AS "userId",
      TO_CHAR(tt."createdAt", 'YYYY-MM-DD') AS "date",
      COUNT(tt.id) AS "total"
    FROM "TicketTraking" tt
    INNER JOIN "Users" u ON u.id = tt."userId"
    WHERE tt."companyId" = ${companyId}
      AND tt."createdAt" >= '${initialDate} 00:00:00'
      AND tt."createdAt" <= '${finalDate} 23:59:59'
    GROUP BY u.id, TO_CHAR(tt."createdAt", 'YYYY-MM-DD')
    ORDER BY "date" ASC;
  `;

  // Summary query
  const sqlSummary = `
    SELECT
      COUNT(DISTINCT tt.id) AS "totalTickets",
      COUNT(DISTINCT tt."userId") AS "totalUsers",
      COALESCE(AVG(
        CASE WHEN tt."closedAt" IS NOT NULL OR tt."finishedAt" IS NOT NULL THEN
          (EXTRACT(EPOCH FROM COALESCE(tt."closedAt", tt."finishedAt") - tt."startedAt") / 60)
        END
      ), 0) AS "avgSupportTime",
      COALESCE(AVG(
        CASE WHEN tt."queuedAt" IS NOT NULL THEN
          -- Mesma correção do bloco acima: espera termina no startedAt.
          EXTRACT(EPOCH FROM (COALESCE(tt."startedAt", now()) - tt."queuedAt")) / 60
        END
      ), 0) AS "avgWaitTime",
      COALESCE(AVG(ur.rate), 0) AS "avgRating"
    FROM "TicketTraking" tt
    LEFT JOIN "Tickets" t ON t.id = tt."ticketId"
    LEFT JOIN "UserRatings" ur ON ur."ticketId" = t.id
    WHERE tt."companyId" = ${companyId}
      AND tt."createdAt" >= '${initialDate} 00:00:00'
      AND tt."createdAt" <= '${finalDate} 23:59:59';
  `;

  const [users, byDay, summaryArr] = await Promise.all([
    sequelize.query(sql, { type: QueryTypes.SELECT }),
    sequelize.query(sqlByDay, { type: QueryTypes.SELECT }),
    sequelize.query(sqlSummary, { type: QueryTypes.SELECT, plain: true }),
  ]);

  // Merge byDay into users
  const byDayMap: Record<number, { date: string; total: number }[]> = {};
  (byDay as any[]).forEach((row) => {
    if (!byDayMap[row.userId]) byDayMap[row.userId] = [];
    byDayMap[row.userId].push({ date: row.date, total: parseInt(row.total, 10) });
  });

  const data = (users as any[]).map((u) => ({
    ...u,
    totalTickets: parseInt(u.totalTickets, 10),
    openTickets: parseInt(u.openTickets, 10),
    pendingTickets: parseInt(u.pendingTickets, 10),
    closedTickets: parseInt(u.closedTickets, 10),
    avgSupportTime: parseFloat(u.avgSupportTime) || 0,
    avgWaitTime: parseFloat(u.avgWaitTime) || 0,
    minSupportTime: parseFloat(u.minSupportTime) || 0,
    maxSupportTime: parseFloat(u.maxSupportTime) || 0,
    avgRating: parseFloat(u.avgRating) || 0,
    totalRatings: parseInt(u.totalRatings, 10),
    ticketsByDay: byDayMap[u.userId] || [],
  }));

  const summary = {
    totalTickets: parseInt((summaryArr as any)?.totalTickets, 10) || 0,
    totalUsers: parseInt((summaryArr as any)?.totalUsers, 10) || 0,
    avgSupportTime: parseFloat((summaryArr as any)?.avgSupportTime) || 0,
    avgWaitTime: parseFloat((summaryArr as any)?.avgWaitTime) || 0,
    avgRating: parseFloat((summaryArr as any)?.avgRating) || 0,
  };

  return { data, summary };
};
