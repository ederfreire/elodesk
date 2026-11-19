import { getOAuth2ClientAsync, GOOGLE_CALENDAR_SCOPES } from "./oauthClient";

interface Params {
  companyId: number;
  userId: number;
  // Endereço do painel de onde o operador clicou em "Conectar". Em
  // instalação multi-empresa cada cliente costuma acessar por um
  // domínio/subdomínio próprio — sem guardar isso, o callback do Google
  // devolvia TODO mundo pra FRONTEND_URL (o painel principal), onde o
  // cliente não está logado: era o "o sistema não me reconhece como
  // cliente" relatado. Vai junto no state (o Google devolve intacto).
  origin?: string;
  // Base do próprio backend, deduzida da requisição — usada pra montar a
  // URL de retorno quando não há BACKEND_URL no .env (ver oauthClient).
  backendUrl?: string;
}

const GetAuthUrlService = async ({ companyId, userId, origin, backendUrl }: Params): Promise<string> => {
  const oauth2 = await getOAuth2ClientAsync(companyId, backendUrl, true);
  const state = Buffer.from(
    JSON.stringify({ companyId, userId, ...(origin ? { origin } : {}) })
  ).toString("base64url");
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_CALENDAR_SCOPES,
    state
  });
};

export default GetAuthUrlService;
