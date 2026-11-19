import { randomBytes } from "crypto";
import User from "../../models/User";
import Plan from "../../models/Plan";
import Company from "../../models/Company";
import CompaniesSettings from "../../models/CompaniesSettings";
import CreateCompanyService from "../CompanyService/CreateCompanyService";
import { SerializeUser } from "../../helpers/SerializeUser";
import {
  createAccessToken,
  createRefreshToken
} from "../../helpers/CreateTokens";
import { getLoginOAuth2Client, GOOGLE_LOGIN_SCOPES } from "./oauthLoginClient";
import logger from "../../utils/logger";

// =========================================================
// Build authorization URL (Step 1)
// =========================================================
export const buildGoogleAuthUrl = async (
  mode: "login" | "signup" = "login"
): Promise<string> => {
  const oauth2 = await getLoginOAuth2Client();
  const nonce = randomBytes(8).toString("hex");
  const state = Buffer.from(JSON.stringify({ mode, nonce })).toString(
    "base64url"
  );
  return oauth2.generateAuthUrl({
    access_type: "online",
    prompt: "consent",
    scope: GOOGLE_LOGIN_SCOPES,
    state,
    include_granted_scopes: true
  });
};

// =========================================================
// Handle OAuth callback (Step 2)
//   - exchanges code for tokens
//   - fetches user profile (email, name, picture)
//   - finds existing User → returns login payload
//   - if no User → AUTO-CREATES company + user with default plan
//     and returns login payload (fully automatic signup, no form)
// =========================================================
export interface GoogleCallbackResult {
  action: "login";
  email: string;
  name?: string;
  picture?: string;
  token?: string;
  refreshToken?: string;
  serializedUser?: any;
}

const pickDefaultPlan = async (): Promise<Plan> => {
  // Prefer first trial plan; fallback to first plan available
  const trialPlan = await Plan.findOne({
    where: { trial: true } as any,
    order: [["amount", "ASC"], ["id", "ASC"]]
  });
  if (trialPlan) return trialPlan;
  const anyPlan = await Plan.findOne({
    order: [["amount", "ASC"], ["id", "ASC"]]
  });
  if (!anyPlan) {
    throw new Error(
      "Nenhum plano cadastrado. Crie ao menos um plano antes de habilitar o cadastro via Google."
    );
  }
  return anyPlan;
};

export const handleGoogleCallback = async (
  code: string
): Promise<GoogleCallbackResult> => {
  const oauth2 = await getLoginOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  // googleapis lib injected via ensureGoogleLib in oauthLoginClient
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { google } = require("googleapis");
  const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
  const { data: profile } = await oauth2Api.userinfo.get();

  const email = (profile.email || "").toLowerCase().trim();
  if (!email) {
    throw new Error("Conta Google sem e-mail acessível.");
  }

  const displayName =
    profile.name || profile.given_name || email.split("@")[0];

  let user = await User.findOne({
    where: { email },
    include: [
      "queues",
      { model: Company, include: [{ model: CompaniesSettings }] }
    ]
  });

  // ===== AUTO-SIGNUP via Google =====
  if (!user) {
    logger.info(`[GoogleLogin] auto-creating account for ${email}`);
    const plan = await pickDefaultPlan();

    const trialDays = Number((plan as any).trialDays || 3);
    const due = new Date();
    due.setDate(due.getDate() + trialDays);
    const dueDate = due.toISOString().split("T")[0];

    // Random password — user can later reset via "esqueci minha senha"
    const randomPassword =
      randomBytes(12).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) +
      "Aa1!";

    await CreateCompanyService({
      name: displayName, // company name = user display name (sem CNPJ)
      email,
      phone: "",
      planId: (plan as any).id,
      status: true,
      dueDate,
      recurrence: "",
      document: "",
      paymentMethod: "",
      password: randomPassword,
      companyUserName: displayName
    });

    user = await User.findOne({
      where: { email },
      include: [
        "queues",
        { model: Company, include: [{ model: CompaniesSettings }] }
      ]
    });
    if (!user) {
      throw new Error("Falha ao criar a conta automaticamente via Google.");
    }
  }

  const serializedUser = await SerializeUser(user);
  const token = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  return {
    action: "login",
    email,
    name: profile.name || user.name,
    picture: profile.picture || "",
    token,
    refreshToken,
    serializedUser
  };
};
