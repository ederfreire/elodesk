import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import Company from "../models/Company";
import Plan from "../models/Plan";

type PlanFeature =
  | "useWhatsapp"
  | "useFacebook"
  | "useInstagram"
  | "useCampaigns"
  | "useSchedules"
  | "useInternalChat"
  | "useExternalApi"
  | "useKanban"
  | "useOpenAi"
  | "useIntegrations"
  | "useFlows"
  | "useContacts"
  | "useDashboard"
  | "useRealTime"
  | "useWhatsappOfficial"
  | "useWhatsappEmbeddedSignup"
  | "wavoip"
  | "useTelegram"
  | "useZapi"
  | "useWacalls"
  | "useVoiceCampaign"
  | "useUtmLinks"
  | "useSalesAgents";

const isPlanFeatureEnabled = (feature: PlanFeature) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { companyId } = req.user;

    if (!companyId) {
      throw new AppError("ERR_NO_COMPANY", 403);
    }

    const company = await Company.findByPk(companyId, {
      include: [{ model: Plan, as: "plan", attributes: [feature] }]
    });

    if (!company || !company.plan) {
      throw new AppError("ERR_NO_PLAN_FOUND", 403);
    }

    const featureEnabled = (company.plan as any)[feature];

    if (featureEnabled === false) {
      throw new AppError("ERR_PLAN_FEATURE_DISABLED", 403);
    }

    return next();
  };
};

export default isPlanFeatureEnabled;
