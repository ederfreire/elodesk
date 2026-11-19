import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import Setting from "../../models/Setting";
import User from "../../models/User";
import Plan from "../../models/Plan";
import Invoices from "../../models/Invoices";


interface CompanyData {
  timezone?: string;
  name: string;
  id?: number | string;
  phone?: string;
  email?: string;
  status?: boolean;
  planId?: number;
  campaignsEnabled?: boolean;
  dueDate?: string;
  recurrence?: string;
  document?: string;
  paymentMethod?: string;
  password?: string;
  passwordDefault?: string;
  generateInvoice?: boolean;
}

const UpdateCompanyService = async (
  companyData: CompanyData
): Promise<Company> => {

  const company = await Company.findByPk(companyData.id);
  const {
    name,
    timezone,
    phone,
    email,
    status,
    planId,
    campaignsEnabled,
    dueDate,
    recurrence,
    document,
    paymentMethod,
    password,
    passwordDefault,
    generateInvoice
  } = companyData;

  if (!company) {
    throw new AppError("ERR_NO_COMPANY_FOUND", 404);
  }

  const newPassword = password || passwordDefault;

  // Localiza primeiro o usuário vinculado ao e-mail atual da empresa.
  // Isso evita atualizar outro atendente/admin quando a empresa possui
  // mais de um usuário com profile "admin".
  let user = company.email
    ? await User.findOne({
        where: { companyId: company.id, email: company.email },
        order: [["id", "ASC"]]
      })
    : null;

  if (!user && email) {
    user = await User.findOne({
      where: { companyId: company.id, email },
      order: [["id", "ASC"]]
    });
  }

  if (!user) {
    user = await User.findOne({
      where: { companyId: company.id, profile: "admin" },
      order: [["id", "ASC"]]
    });
  }

  if (!user) {
    user = await User.findOne({
      where: { companyId: company.id },
      order: [["id", "ASC"]]
    });
  }

  // Verifica se o novo email já está em uso por OUTRO usuário
  if (email && (!user || email !== user.email)) {
    const existUser = await User.findOne({ where: { email } });
    if (existUser && (!user || existUser.id !== user.id)) {
      throw new AppError("Usuário já existe com esse e-mail!", 400);
    }
  }

  if (user) {
    const userUpdate: { email?: string; password?: string } = {};
    if (email) userUpdate.email = email;
    if (newPassword && newPassword.trim() !== "") userUpdate.password = newPassword;
    if (Object.keys(userUpdate).length > 0) {
      await user.update(userUpdate);
    }
  }

  const previousPlanId = company.planId;

  await company.update({
    name,
    ...(timezone !== undefined ? { timezone } : {}),
    phone,
    email,
    status,
    planId,
    dueDate,
    recurrence,
    document,
    paymentMethod,
    generateInvoice
  });

  // Se o plano foi alterado, atualiza faturas em aberto para refletir o plano atual
  if (planId && planId !== previousPlanId) {
    try {
      const newPlan = await Plan.findByPk(planId);
      if (newPlan) {
        await Invoices.update(
          {
            detail: newPlan.name,
            value: Number(newPlan.amount || 0),
            users: newPlan.users,
            connections: newPlan.connections,
            queues: newPlan.queues,
            useWhatsapp: newPlan.useWhatsapp || false,
            useFacebook: newPlan.useFacebook || false,
            useInstagram: newPlan.useInstagram || false,
            useCampaigns: newPlan.useCampaigns || false,
            useSchedules: newPlan.useSchedules || false,
            useInternalChat: newPlan.useInternalChat || false,
            useExternalApi: newPlan.useExternalApi || false
          } as any,
          { where: { companyId: company.id, status: "open" } }
        );
      }
    } catch (e) {
      // não bloqueia o update principal
      console.error("Falha ao sincronizar faturas com novo plano:", e);
    }
  }

  if (companyData.campaignsEnabled !== undefined) {

    const [setting, created] = await Setting.findOrCreate({
      where: {
        companyId: company.id,
        key: "campaignsEnabled"
      },
      defaults: {
        companyId: company.id,
        key: "campaignsEnabled",
        value: `${campaignsEnabled}`
      }
    });
    if (!created) {
      await setting.update({ value: `${campaignsEnabled}` });
    }
  }

  return company;
};

export default UpdateCompanyService;
