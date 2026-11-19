/* Backend OAuth flow for Google Login (social sign-in).
 * Reuses the `googleapis` lib and reads credentials from Settings DB
 * (googleClientId/googleClientSecret) with fallback to env vars.
 */
import Setting from "../../models/Setting";
import { ensureGoogleLib } from "../GoogleCalendarService/oauthClient";

export const GOOGLE_LOGIN_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid"
];

const readSetting = async (key: string): Promise<string | null> => {
  try {
    const s = await Setting.findOne({ where: { key, companyId: 1 } });
    return s && s.value ? String(s.value) : null;
  } catch (_) {
    return null;
  }
};

export async function resolveGoogleLoginCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}> {
  const clientId =
    (await readSetting("googleClientId")) ||
    process.env.GOOGLE_LOGIN_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    "";
  const clientSecret =
    (await readSetting("googleClientSecret")) ||
    process.env.GOOGLE_LOGIN_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "";
  const backendUrl = (process.env.BACKEND_URL || "").replace(/\/$/, "");
  const redirectUri =
    process.env.GOOGLE_LOGIN_REDIRECT_URI ||
    (backendUrl ? `${backendUrl}/auth/google/callback` : "");

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Credenciais do Google Login não configuradas. Defina em Configurações → Instagram/Facebook (Google Login OAuth) e BACKEND_URL no .env."
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export async function getLoginOAuth2Client() {
  const { google } = ensureGoogleLib();
  const { clientId, clientSecret, redirectUri } = await resolveGoogleLoginCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
