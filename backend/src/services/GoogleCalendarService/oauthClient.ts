/* eslint-disable @typescript-eslint/no-var-requires */
// Helper para criar OAuth2 client do Google Calendar.
// Credenciais lidas (em ordem de prioridade):
//   1) Setting do banco (companyId=1): googleCalendarClientId / googleCalendarClientSecret
//   2) Setting do banco (companyId=1): googleClientId / googleClientSecret (fallback p/ OAuth único)
//   3) Variáveis de ambiente: GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET
import Setting from "../../models/Setting";

let googleLib: any = null;
try {
  // eslint-disable-next-line global-require
  googleLib = require("googleapis");
} catch (_) {
  googleLib = null;
}

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email"
];

export function ensureGoogleLib() {
  if (!googleLib) {
    throw new Error(
      "Pacote 'googleapis' não instalado. Rode: npm i googleapis --save no backend."
    );
  }
  return googleLib;
}

const readSetting = async (key: string, companyId: number): Promise<string | null> => {
  try {
    const s = await Setting.findOne({ where: { key, companyId } });
    return s && s.value ? String(s.value) : null;
  } catch (_) {
    return null;
  }
};

/**
 * Base do backend deduzida da própria requisição (ex.:
 * "https://api.suaempresa.com"), usada quando BACKEND_URL /
 * GOOGLE_CALENDAR_REDIRECT_URI não estão no .env. Assim a integração
 * funciona "de fábrica", sem precisar configurar nada por instalação.
 * Respeita x-forwarded-proto/host porque em produção o backend fica atrás
 * do nginx — sem isso a URL sairia como http://127.0.0.1:PORTA e o Google
 * recusaria o redirect.
 */
export function backendBaseUrlFromRequest(req: any): string {
  if (!req) return "";
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const forwardedHost = String(req.headers?.["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const proto = forwardedProto || req.protocol || "https";
  const host = forwardedHost || req.get?.("host") || req.headers?.host || "";
  if (!host) return "";
  return `${proto}://${host}`.replace(/\/$/, "");
}

export async function resolveCalendarCredentials(
  companyId: number = 1,
  requestBackendUrl?: string,
  // Só o fluxo de autorização (gerar URL / trocar código por token) precisa
  // do redirect. O uso no dia a dia (criar evento pelo fluxo, renovar
  // token) não usa redirect nenhum — exigir ali quebraria a agenda em
  // execução só por falta de uma variável de ambiente.
  requireRedirectUri: boolean = false
): Promise<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}> {
  // Client ID e Secret são resolvidos EM PAR e sempre da mesma origem.
  // Antes cada um era buscado isoladamente: dava para acabar com o ID de uma
  // empresa e o Secret da plataforma, e o Google recusava a autorização com
  // "invalid_client" sem explicação.
  //
  // Mesma lógica da Meta/Facebook: as credenciais são da PLATAFORMA
  // (companyId 1, cadastradas uma única vez pelo super admin). Cada empresa
  // só autoriza a própria conta Google por cima delas. O par da própria
  // empresa e as variáveis de ambiente ficam apenas como retrocompatibilidade.
  const paresCandidatos: Array<[string | null, string | null]> = [
    [
      await readSetting("googleCalendarClientId", 1),
      await readSetting("googleCalendarClientSecret", 1)
    ],
    [
      await readSetting("googleClientId", 1),
      await readSetting("googleClientSecret", 1)
    ],
    ...(companyId !== 1
      ? ([
          [
            await readSetting("googleCalendarClientId", companyId),
            await readSetting("googleCalendarClientSecret", companyId)
          ],
          [
            await readSetting("googleClientId", companyId),
            await readSetting("googleClientSecret", companyId)
          ]
        ] as Array<[string | null, string | null]>)
      : []),
    [
      process.env.GOOGLE_CALENDAR_CLIENT_ID || null,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET || null
    ]
  ];

  const par = paresCandidatos.find(([id, secret]) => !!id && !!secret);
  const clientId = par?.[0] || "";
  const clientSecret = par?.[1] || "";


  // Ordem: variável explícita → BACKEND_URL do .env → deduzido da própria
  // requisição. O último caso é o que faz a integração funcionar sem
  // nenhuma configuração de ambiente.
  const backendUrl = (
    process.env.BACKEND_URL ||
    requestBackendUrl ||
    ""
  ).replace(/\/$/, "");
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
    (backendUrl ? `${backendUrl}/google-calendar/oauth/callback` : "");

  // Mensagens separadas: faltar Client ID/Secret (algo que só o dono da
  // plataforma cadastra uma vez) é um problema diferente de não conseguir
  // montar a URL de retorno. Antes os dois casos caíam no mesmo erro
  // genérico e não dava pra saber o que corrigir.
  if (!clientId || !clientSecret) {
    throw new Error("ERR_GOOGLE_CALENDAR_CREDENTIALS_MISSING");
  }
  if (requireRedirectUri && !redirectUri) {
    throw new Error("ERR_GOOGLE_CALENDAR_REDIRECT_URI_MISSING");
  }

  return { clientId, clientSecret, redirectUri };
}

// Mantida síncrona para compatibilidade com chamadas existentes:
// usa apenas env. Quem quiser DB deve usar getOAuth2ClientAsync().
export function getOAuth2Client() {
  const { google } = ensureGoogleLib();
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (clientId && clientSecret && redirectUri) {
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }
  throw new Error("ERR_GOOGLE_CALENDAR_CREDENTIALS_MISSING");
}

export async function getOAuth2ClientAsync(
  companyId: number = 1,
  requestBackendUrl?: string,
  requireRedirectUri: boolean = false
) {
  const { google } = ensureGoogleLib();
  const { clientId, clientSecret, redirectUri } = await resolveCalendarCredentials(
    companyId,
    requestBackendUrl,
    requireRedirectUri
  );
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri || undefined);
}
