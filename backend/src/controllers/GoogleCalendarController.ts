import { Request, Response } from "express";
import GetAuthUrlService from "../services/GoogleCalendarService/GetAuthUrlService";
import HandleOAuthCallbackService from "../services/GoogleCalendarService/HandleOAuthCallbackService";
import ListCalendarsService from "../services/GoogleCalendarService/ListCalendarsService";
import { GetConfig, UpdateConfig, Disconnect } from "../services/GoogleCalendarService/ConfigService";
import { backendBaseUrlFromRequest, resolveCalendarCredentials } from "../services/GoogleCalendarService/oauthClient";
import logger from "../utils/logger";

/**
 * Conectar, alterar e desconectar a conta do Google é decisão do
 * administrador da empresa — a integração é única e vale para todos os
 * atendentes. Responde 403 (e nunca 401) para o frontend não confundir falta
 * de permissão com sessão expirada e derrubar o login do atendente.
 */
const exigirAdministrador = (req: Request, res: Response): boolean => {
  const perfil = (req.user as any)?.profile;
  if (perfil !== "admin" && perfil !== "super") {
    res.status(403).json({ error: "Somente o administrador pode alterar a integração com o Google Agenda." });
    return false;
  }
  return true;
};

export const getAuthUrl = async (req: Request, res: Response): Promise<Response> => {
  if (!exigirAdministrador(req, res)) return res;
  const { companyId, id: userId } = req.user as any;
  try {
    // De onde o operador clicou em "Conectar" — usado pra devolver ele pro
    // MESMO painel depois de autorizar no Google (ver comentário em
    // GetAuthUrlService). Sem isso, cliente com domínio próprio voltava
    // pro painel principal, deslogado.
    const rawOrigin =
      (req.headers.origin as string) ||
      (req.headers.referer ? new URL(req.headers.referer as string).origin : "");

    const url = await GetAuthUrlService({
      companyId: Number(companyId),
      userId: Number(userId),
      origin: rawOrigin || undefined,
      // Deduz a URL do backend da própria requisição quando não há
      // BACKEND_URL no .env — faz a integração funcionar sem configuração.
      backendUrl: backendBaseUrlFromRequest(req) || undefined
    });
    return res.json({ url });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

/**
 * Endereço do painel pra onde devolver o operador depois de autorizar.
 * Toda a plataforma usa UM domínio só (todas as empresas entram pelo mesmo
 * painel), então na prática isso é sempre o mesmo endereço — o `origin` que
 * viaja no state serve só pra funcionar sem FRONTEND_URL configurado, e é
 * aceito apenas quando bate com o domínio da instalação (mesmo host ou um
 * subdomínio dele). Qualquer outra coisa cai no padrão, pra isso não virar
 * um redirecionamento aberto.
 */
const resolveSafeFrontendUrl = (origin?: string): string => {
  const configured = process.env.FRONTEND_URL || "";

  if (!origin) return configured || "/";

  try {
    const candidate = new URL(origin);
    if (!/^https?:$/.test(candidate.protocol)) return configured || "/";

    // Sem FRONTEND_URL no .env: confia no painel de onde a solicitação
    // partiu (é o mesmo domínio da instalação — o operador estava logado
    // nele pra conseguir clicar em "Conectar").
    if (!configured) return candidate.origin;

    const baseHost = new URL(configured).hostname.toLowerCase();
    const candHost = candidate.hostname.toLowerCase();
    if (candHost === baseHost || candHost.endsWith(`.${baseHost}`)) {
      return candidate.origin;
    }
  } catch (_) {
    /* origin malformado — cai no padrão */
  }

  return configured || "/";
};

export const oauthCallback = async (req: Request, res: Response): Promise<Response | void> => {
  const { code, state, error } = req.query as Record<string, string>;

  // Lê o origin de dentro do state ANTES de processar, pra qualquer
  // resposta (inclusive erro) voltar pro painel certo.
  let stateOrigin: string | undefined;
  try {
    if (state) {
      const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
      stateOrigin = parsed?.origin;
    }
  } catch (_) {
    /* state inválido — tratado abaixo */
  }

  const frontendUrl = resolveSafeFrontendUrl(stateOrigin);
  const redirect = (status: "success" | "error", msg?: string) =>
    res.redirect(`${frontendUrl}/google-calendar?status=${status}${msg ? `&message=${encodeURIComponent(msg)}` : ""}`);

  if (error) return redirect("error", error);
  if (!code || !state) return redirect("error", "missing_code");
  try {
    await HandleOAuthCallbackService({
      code,
      state,
      backendUrl: backendBaseUrlFromRequest(req) || undefined
    });
    return redirect("success");
  } catch (err: any) {
    logger.error(`[GoogleCalendar] callback error: ${err.message}`);
    return redirect("error", err.message);
  }
};

export const getConfig = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as any;
  const cfg = await GetConfig(Number(companyId));

  // A tela precisa mostrar, prontos para copiar, os dois valores que o Google
  // Cloud exige no cadastro do OAuth: a URI de redirecionamento e a origem
  // JavaScript. Eles são DERIVADOS da URL do backend — pedir para o usuário
  // montar à mão é a origem mais comum de "redirect_uri_mismatch".
  const backendUrl = (
    process.env.BACKEND_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/$/, "");

  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
    `${backendUrl}/google-calendar/oauth/callback`;

  const jsOrigin = (process.env.FRONTEND_URL || "").replace(/\/$/, "");

  // Indica se o super admin já cadastrou as credenciais da plataforma. Sem
  // isso a empresa só descobria que a integração não foi liberada ao clicar
  // em "Conectar" e receber um erro.
  let credentialsReady = false;
  try {
    await resolveCalendarCredentials(Number(companyId));
    credentialsReady = true;
  } catch (_) {
    credentialsReady = false;
  }

  // `cfg` é null quando a empresa ainda não conectou nenhuma conta. Mesmo
  // assim a tela precisa dos dois valores acima para o passo 1 do cadastro
  // funcionar — por isso devolve um objeto em vez de null.
  return res.json({
    ...(cfg || { connected: false }),
    redirectUri,
    jsOrigin,
    credentialsReady
  });

};

export const updateConfig = async (req: Request, res: Response): Promise<Response> => {
  if (!exigirAdministrador(req, res)) return res;
  const { companyId } = req.user as any;
  try {
    const cfg = await UpdateConfig(Number(companyId), req.body || {});
    return res.json(cfg);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

export const listCalendars = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as any;
  try {
    const list = await ListCalendarsService(Number(companyId));
    return res.json(list);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

export const disconnect = async (req: Request, res: Response): Promise<Response> => {
  if (!exigirAdministrador(req, res)) return res;
  const { companyId } = req.user as any;
  await Disconnect(Number(companyId));
  return res.json({ ok: true });
};
