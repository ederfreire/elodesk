import GoogleCalendarIntegration from "../../models/GoogleCalendarIntegration";
import { getOAuth2ClientAsync } from "./oauthClient";

// Retorna OAuth2 client autenticado, renovando access_token se necessário.
export default async function getAuthenticatedClient(companyId: number) {
  const integration = await GoogleCalendarIntegration.findOne({ where: { companyId } });
  if (!integration || !integration.isActive) {
    throw new Error("Google Agenda não conectado para esta empresa.");
  }
  if (!integration.refreshToken && !integration.accessToken) {
    throw new Error("Tokens do Google ausentes. Reconecte a conta.");
  }

  const oauth2 = await getOAuth2ClientAsync(companyId);
  oauth2.setCredentials({
    access_token: integration.accessToken,
    refresh_token: integration.refreshToken,
    expiry_date: integration.tokenExpiresAt ? integration.tokenExpiresAt.getTime() : undefined
  });

  // Se token expirou ou está prestes a expirar (60s), renova
  const expiresIn = integration.tokenExpiresAt
    ? integration.tokenExpiresAt.getTime() - Date.now()
    : -1;
  if (expiresIn < 60_000) {
    try {
      const { credentials } = await oauth2.refreshAccessToken();
      oauth2.setCredentials(credentials);
      await integration.update({
        accessToken: credentials.access_token || integration.accessToken,
        refreshToken: credentials.refresh_token || integration.refreshToken,
        tokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : integration.tokenExpiresAt
      });
    } catch (err: any) {
      throw new Error(`Falha ao renovar token Google: ${err.message}`);
    }
  }

  return { oauth2, integration };
}
