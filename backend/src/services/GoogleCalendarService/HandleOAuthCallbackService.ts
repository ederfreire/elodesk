import GoogleCalendarIntegration from "../../models/GoogleCalendarIntegration";
import { getOAuth2ClientAsync, ensureGoogleLib } from "./oauthClient";

interface Params {
  code: string;
  state: string;
  // MESMA base usada pra montar a URL de retorno no início do fluxo — a
  // troca do código por token exige que o redirect_uri seja idêntico ao
  // que foi enviado ao Google, senão o Google recusa com "redirect_uri
  // mismatch". Como aqui o callback chega no próprio backend, deduzir da
  // requisição dá exatamente o mesmo endereço.
  backendUrl?: string;
}

const HandleOAuthCallbackService = async ({ code, state, backendUrl }: Params) => {
  let parsed: any;
  try {
    parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch (_) {
    throw new Error("State inválido no callback do Google.");
  }
  const companyId: number = parsed.companyId;
  if (!companyId) throw new Error("companyId ausente no state.");

  const oauth2 = await getOAuth2ClientAsync(companyId, backendUrl, true);
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  // Recupera e-mail do usuário Google
  const { google } = ensureGoogleLib();
  const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
  const { data: profile } = await oauth2Api.userinfo.get();

  const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

  const [integration] = await GoogleCalendarIntegration.findOrCreate({
    where: { companyId },
    defaults: {
      companyId,
      googleEmail: profile.email,
      accessToken: tokens.access_token || null,
      refreshToken: tokens.refresh_token || null,
      tokenExpiresAt: expiresAt,
      calendarId: "primary",
      isActive: true
    } as any
  });

  await integration.update({
    googleEmail: profile.email,
    accessToken: tokens.access_token || integration.accessToken,
    // Refresh token só vem na primeira autorização; preserva se ausente
    refreshToken: tokens.refresh_token || integration.refreshToken,
    tokenExpiresAt: expiresAt || integration.tokenExpiresAt,
    isActive: true
  });

  return integration;
};

export default HandleOAuthCallbackService;
