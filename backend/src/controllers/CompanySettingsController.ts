/** 
 * @TercioSantos-0 |
 * controller/get/todas as configurações de 1 empresa |
 * controller/get/1 configuração específica |
 * controller/put/atualização de 1 configuração |
 * @param:companyId
 */
import { Request, Response } from "express";
import FindCompanySettingsService from "../services/CompaniesSettings/FindCompanySettingsService";
import UpdateCompanySettingsService from "../services/CompaniesSettings/UpdateCompanySettingService";
import FindCompanySettingOneService from "../services/CompaniesSettings/FindCompanySettingOneService";
import User from "../models/User";
import Company from "../models/Company";
import CompaniesSettings from "../models/CompaniesSettings";

type IndexGetCompanySettingQuery = {
  companyId: number;
  column: string;
  data:string;
};

type IndexGetCompanySettingOneQuery = {
  column: string;
};

export const show = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const requestUser = await User.findByPk(req.user.id);
    const requestedCompanyId = Number(req.params.companyId);
    const isSuper = !!requestUser?.super;
    const companyId = isSuper && Number.isFinite(requestedCompanyId)
      ? requestedCompanyId
      : req.user.companyId;

    const settings = await FindCompanySettingsService({
      companyId
    });

    return res.status(200).json(settings);
  };


  export const showOne = async (req: Request, res: Response): Promise<Response> => {
    const { column } = req.query as IndexGetCompanySettingOneQuery;
    const { companyId } = req.user;
    
    const setting = await FindCompanySettingOneService({
      companyId,
      column
    });
    
    return res.status(200).json(setting[0]);
  };

export const update = async(
  req: Request,
  res: Response
): Promise<Response> => {
  const {  column, data, companyId: requestedCompanyId } = req.body as IndexGetCompanySettingQuery;
  const requestUser = await User.findByPk(req.user.id);
  const isSuper = !!requestUser?.super;
  let companyId = req.user.companyId;

  if (column === "currency") {
    const parsedCompanyId = Number(requestedCompanyId);
    if (Number.isFinite(parsedCompanyId) && parsedCompanyId > 0) {
      // Apenas super pode alterar a moeda de OUTRA empresa.
      // Admin comum só pode alterar a própria empresa.
      if (!isSuper && parsedCompanyId !== req.user.companyId) {
        return res.status(403).json({
          error: "Apenas o admin master pode alterar a moeda de outra empresa."
        });
      }
      companyId = parsedCompanyId;
    } else {
      // Sem companyId no payload: somente super pode propagar para TODAS as empresas.
      if (!isSuper) {
        // Admin comum sem companyId no payload => salva só para a própria empresa.
        companyId = req.user.companyId;
        // segue fluxo normal abaixo (UpdateCompanySettingsService)
        // pulando bloco de propagação
      } else {
      // Sem companyId → moeda central. Atualiza a master e propaga
      // para TODAS as empresas, garantindo que todo mundo passe a usar
      // a moeda definida pelo admin master.
      companyId = req.user.companyId;

      try {
        const allCompanies = await Company.findAll({ attributes: ["id"] });
        for (const c of allCompanies) {
          const existing = await CompaniesSettings.findOne({
            where: { companyId: c.id }
          });
          if (existing) {
            await existing.update({ currency: data });
          } else {
            await CompaniesSettings.create({
              companyId: c.id,
              currency: data
            } as any);
          }
        }
        // eslint-disable-next-line no-console
        return res.status(200).json({ response: true, propagated: allCompanies.length });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[CURRENCY PROPAGATION ERROR]", err);
      }
      }
    }

    // eslint-disable-next-line no-console
  }

  const result = await UpdateCompanySettingsService({
    companyId,
    column,
    data
  })

  return res.status(200).json({response:true, result:result});
}
