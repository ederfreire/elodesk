import { endOfDay, isValid, parseISO, startOfDay } from "date-fns";
import { Op } from "sequelize";
import Lead from "../../models/Lead";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";

interface Request {
  companyId: string | number;
  startDate?: string;
  endDate?: string;
  status?: string;
  searchParam?: string;
  pageNumber?: string | number;
}

const ListLeadsReportService = async ({
  companyId,
  startDate,
  endDate,
  status,
  searchParam,
  pageNumber = 1
}: Request) => {
  const where: any = { companyId };

  if (startDate && endDate) {
    const parsedStartDate = parseISO(startDate);
    const parsedEndDate = parseISO(endDate);

    if (!isValid(parsedStartDate) || !isValid(parsedEndDate)) {
      throw new Error("Invalid date range");
    }

    where.createdAt = {
      [Op.between]: [
        startOfDay(parsedStartDate),
        endOfDay(parsedEndDate)
      ]
    };
  }

  if (status && status !== "all") {
    where.status = status;
  }

  if (searchParam) {
    const term = `%${searchParam.toLowerCase().trim()}%`;
    where[Op.or] = [
      { phone: { [Op.iLike]: term } },
      { adTitle: { [Op.iLike]: term } },
      { adId: { [Op.iLike]: term } },
      { ctwa_clid: { [Op.iLike]: term } }
    ];
  }

  const limit = 50;
  const offset = limit * (Number(pageNumber) - 1);

  const { count, rows: leads } = await Lead.findAndCountAll({
    where,
    include: [
      { model: Contact, as: "contact", attributes: ["id", "name", "number"] },
      { model: Ticket, as: "firstTicket", attributes: ["id", "status"] }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  // KPIs (full set, ignoring pagination)
  const allForKpis = await Lead.findAll({
    where,
    attributes: ["status", "adTitle", "adId"]
  });

  const totals = {
    total: allForKpis.length,
    new: allForKpis.filter(l => l.status === "new").length,
    contact: allForKpis.filter(l => l.status === "contact").length,
    qualified: allForKpis.filter(l => l.status === "qualified").length,
    purchase: allForKpis.filter(l => l.status === "purchase").length,
    lost: allForKpis.filter(l => l.status === "lost").length
  };

  const byAdMap = new Map<string, { adId: string; adTitle: string; total: number; purchases: number }>();
  allForKpis.forEach(l => {
    const key = l.adId || l.adTitle || "(sem anúncio)";
    const cur = byAdMap.get(key) || {
      adId: l.adId || "",
      adTitle: l.adTitle || "(sem anúncio)",
      total: 0,
      purchases: 0
    };
    cur.total += 1;
    if (l.status === "purchase") cur.purchases += 1;
    byAdMap.set(key, cur);
  });
  const byAd = Array.from(byAdMap.values()).sort((a, b) => b.total - a.total);

  const hasMore = count > offset + leads.length;

  return { leads, count, hasMore, totals, byAd };
};

export default ListLeadsReportService;