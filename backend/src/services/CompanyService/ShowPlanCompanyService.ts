import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import Plan from "../../models/Plan";

const ShowPlanCompanyService = async (id: string | number): Promise<Company> => {
    const normalizedId = Number(id);

    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
        throw new AppError("ERR_NO_COMPANY_FOUND", 400);
    }

    const companies = await Company.findOne({
        where: { id: normalizedId },
        attributes: ["id", "name", "email", "status", "dueDate", "createdAt", "phone", "document", "lastLogin"],
        order: [["name", "ASC"]],
        include: [
            {
                model: Plan, as: "plan",
                attributes: [
                    "id",
                    "name",
                    "users",
                    "connections",
                    "queues",
                    "amount",
                    "useWhatsapp",
                    "useFacebook",
                    "useInstagram",
                    "useCampaigns",
                    "useSchedules",
                    "useInternalChat",
                    "useExternalApi",
                    "useKanban",
                    "useOpenAi",
                    "useIntegrations",
                    "useWhatsappOfficial",
                    "wavoip",
                    "useFlows",
                    "useContacts",
                    "useDashboard",
                    "useRealTime",
                    "useTelegram",
                    "useZapi",
                    "useWhatsappEmbeddedSignup",
                    "useWebchat",
                    "useWacalls",
                    "useVoiceCampaign",
                    "useUtmLinks",
                    "useSalesAgents"
                ]
            },
        ]
    });

    if (!companies) {
        throw new AppError("ERR_NO_COMPANY_FOUND", 404);
    }

    return companies;
};

export default ShowPlanCompanyService;
