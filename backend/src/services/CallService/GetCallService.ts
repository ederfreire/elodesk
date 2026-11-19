import CallHistory from "../../models/CallHistory";
import Company from "../../models/Company";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import { Op } from "sequelize";

interface GetHistoricalParams {
  user_id: number;
  company_id: number;
  showAll?: boolean;
  dateStart?: string;
  dateEnd?: string;
}

const getHistorical = async (body: GetHistoricalParams) => {
  try {
    const where: any = { company_id: body.company_id };

    if (body.dateStart) {
      where.createdAt = { ...where.createdAt, [Op.gte]: new Date(body.dateStart + "T00:00:00") };
    }
    if (body.dateEnd) {
      where.createdAt = { ...where.createdAt, [Op.lte]: new Date(body.dateEnd + "T23:59:59") };
    }

    const calls = await CallHistory.findAll({
      where,
      include: [
        { model: User, attributes: ["id", "name"] },
        { model: Company, attributes: ["id", "name"] },
        { model: Whatsapp, attributes: ["id", "name"] },
        { model: Contact, attributes: ["id", "name", "number"] },
      ],
      order: [["createdAt", "DESC"]],
      raw: true,
      nest: true,
    });

    let total = 0;
    let totalServed = 0;
    let totalReject = 0;
    let totalFinish = 0;
    let totalIncoming = 0;

    const resultFinal = calls.map((call: any) => {
      const status = String(call.status || "").toUpperCase();
      const answered = call.duration > 0 || ["COMPLETED", "ANSWERED", "ACCEPTED"].includes(status);
      total++;
      if (answered) totalServed++;
      if (["REJECTED", "DECLINED", "FAILED", "BUSY"].includes(status)) totalReject++;
      if (answered) totalFinish++;
      if (call.direction === "INCOMING") totalIncoming++;


      const callSaveUrl = call.url || (call.duration > 0 ? `https://storage.wavoip.com/${call.token_wavoip}` : "");

      return {
        id: call.id,
        phone_to: call.phone_to || call.contact?.number || "",
        name: call.name || call.contact?.name || "",
        createdAt: call.createdAt,
        status: call.status || "PENDING",
        direction: call.direction || "OUTGOING",
        duration: call.duration || 0,
        callSaveUrl,
        whatsappName: call.whatsapp?.name || "",
        user: call.user || { id: "", name: "" },
        company: call.company || { id: "", name: "" },
      };
    });

    return { resultFinal, total, totalReject, totalServed, totalFinish, totalIncoming };
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("[getHistorical DB] Erro:", msg);
    throw new Error(msg);
  }
};

export default getHistorical;
