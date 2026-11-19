import axios from "axios";
import Setting from "../../models/Setting";
import logger from "../../utils/logger";

const PROD_URL = "https://api.asaas.com/v3";
const SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const ENV_BASE_URL = process.env.ASAAS_BASE_URL;

export type AsaasEnvironment = "production" | "sandbox";

export const resolveBaseUrl = (env?: string | null): string => {
  if (env === "sandbox") return SANDBOX_URL;
  if (env === "production") return PROD_URL;
  // fallback: env var if set, senão produção
  return ENV_BASE_URL || PROD_URL;
};

const buildHeaders = (token: string) => ({
  access_token: token,
  accept: "application/json",
  "User-Agent": "Lovable-FlowBuilder/1.0",
  "Content-Type": "application/json"
});

// Remove qualquer caractere whitespace (espaços, tabs, CR, LF, NBSP, zero-width)
// que normalmente entram quando o usuário cola o token vindo de e-mail/PDF.
const cleanToken = (raw?: string | null): string =>
  (raw || "").replace(/[\s\u00A0\u200B-\u200D\uFEFF]+/g, "");

export const getAsaasToken = async (companyId: number): Promise<string | null> => {
  const setting = await Setting.findOne({ where: { companyId, key: "asaastoken" } });
  const token = cleanToken(setting?.value);
  return token || null;
};

// Resolve o token Asaas: prioriza o token configurado no nó do FlowBuilder;
// se não houver, cai no setting legado (compatibilidade).
export const resolveAsaasToken = async (
  companyId: number,
  nodeToken?: string | null
): Promise<{ token: string | null; source: "node" | "setting" | "none" }> => {
  const fromNode = cleanToken(nodeToken);
  if (fromNode) return { token: fromNode, source: "node" };
  const fromSetting = await getAsaasToken(companyId);
  if (fromSetting) return { token: fromSetting, source: "setting" };
  return { token: null, source: "none" };
};

export const sanitizeDoc = (doc: string): string => (doc || "").replace(/\D/g, "");

// Valida CPF (11) ou CNPJ (14) com dígitos verificadores
export const isValidCpfCnpj = (raw: string): boolean => {
  const doc = sanitizeDoc(raw);
  if (doc.length === 11) {
    if (/^(\d)\1{10}$/.test(doc)) return false;
    const calc = (base: number) => {
      let sum = 0;
      for (let i = 0; i < base; i++) sum += parseInt(doc[i], 10) * (base + 1 - i);
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };
    return calc(9) === parseInt(doc[9], 10) && calc(10) === parseInt(doc[10], 10);
  }
  if (doc.length === 14) {
    if (/^(\d)\1{13}$/.test(doc)) return false;
    const calc = (base: number) => {
      const weights = base === 12
        ? [5,4,3,2,9,8,7,6,5,4,3,2]
        : [6,5,4,3,2,9,8,7,6,5,4,3,2];
      let sum = 0;
      for (let i = 0; i < base; i++) sum += parseInt(doc[i], 10) * weights[i];
      const rest = sum % 11;
      return rest < 2 ? 0 : 11 - rest;
    };
    return calc(12) === parseInt(doc[12], 10) && calc(13) === parseInt(doc[13], 10);
  }
  return false;
};

export interface AsaasBoleto {
  id: string;
  value: number;
  dueDate: string;
  status: string;
  description?: string;
  bankSlipUrl?: string;
  invoiceUrl?: string;
  pixCopyPaste?: string;
  pixQrCodeBase64?: string;
  identificationField?: string;
  nossoNumero?: string;
}

export const fetchPendingBoletosByDoc = async (
  companyId: number,
  cpfCnpj: string,
  statuses: string[] = ["PENDING", "OVERDUE"],
  nodeToken?: string | null,
  environment?: string | null
): Promise<{ ok: boolean; message: string; boletos: AsaasBoleto[] }> => {
  const { token, source } = await resolveAsaasToken(companyId, nodeToken);
  if (!token) {
    return { ok: false, message: "Token Asaas não configurado no nó do FlowBuilder.", boletos: [] };
  }
  const doc = sanitizeDoc(cpfCnpj);
  if (!doc || (doc.length !== 11 && doc.length !== 14)) {
    return { ok: false, message: "CPF/CNPJ inválido. Informe apenas números.", boletos: [] };
  }

  const BASE_URL = resolveBaseUrl(environment);
  const headers = buildHeaders(token);

  const tokenPrefix = `${token.slice(0, 10)}...(${token.length} chars)`;
  logger.info(
    `[ASAAS] Consulta companyId=${companyId} env=${environment || "default"} source=${source} token=${tokenPrefix} url=${BASE_URL} doc=${doc}`
  );

  try {
    const custResp = await axios.get(`${BASE_URL}/customers`, {
      headers,
      params: { cpfCnpj: doc, limit: 5 },
      timeout: 15000
    });
    const customers = custResp.data?.data || [];
    if (!customers.length) {
      return { ok: false, message: "Não encontramos cadastro com este CPF/CNPJ.", boletos: [] };
    }

    const boletos: AsaasBoleto[] = [];
    const statusList = (statuses && statuses.length ? statuses : ["PENDING", "OVERDUE"]).map(s => s.toUpperCase());
    for (const customer of customers) {
      for (const status of statusList) {
        const payResp = await axios.get(`${BASE_URL}/payments`, {
          headers,
          params: { customer: customer.id, status, limit: 20 },
          timeout: 15000
        });
        const items = payResp.data?.data || [];
        for (const p of items) {
          boletos.push({
            id: p.id,
            value: p.value,
            dueDate: p.dueDate,
            status: p.status,
            description: p.description,
            bankSlipUrl: p.bankSlipUrl,
            invoiceUrl: p.invoiceUrl,
            identificationField: p.identificationField,
            nossoNumero: p.nossoNumero
          });
        }
      }
    }

    if (!boletos.length) {
      return { ok: true, message: "Nenhum boleto pendente encontrado para este CPF/CNPJ.", boletos: [] };
    }
    return { ok: true, message: "Boletos encontrados.", boletos };
  } catch (err: any) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    logger.error(
      `[ASAAS] Erro ao buscar boletos (doc=${doc}) source=${source} token=${tokenPrefix} status=${status} url=${BASE_URL} data=${JSON.stringify(data) || err?.message}`
    );

    let message = "Erro ao consultar o Asaas. Tente novamente em instantes.";
    if (status === 401) {
      const usedEnv = environment === "sandbox" ? "Sandbox" : "Produção";
      message =
        `Token Asaas inválido ou não corresponde ao ambiente selecionado (${usedEnv}). Verifique no nó se o token foi gerado no painel ${usedEnv === "Sandbox" ? "sandbox.asaas.com" : "www.asaas.com"}.`;
    } else if (status === 403) {
      message = "Token Asaas sem permissão para consultar cobranças.";
    } else if (status === 404) {
      message = "Endpoint Asaas não encontrado. Verifique a URL base (ASAAS_BASE_URL).";
    } else if (status === 429) {
      message = "Muitas requisições ao Asaas. Aguarde alguns instantes e tente novamente.";
    } else if (err?.code === "ECONNABORTED" || /timeout/i.test(err?.message || "")) {
      message = "Timeout ao consultar o Asaas. Tente novamente em instantes.";
    } else if (Array.isArray(data?.errors) && data.errors[0]?.description) {
      message = `Asaas: ${data.errors[0].description}`;
    }
    return { ok: false, message, boletos: [] };
  }
};

// Busca o PIX (copia-e-cola + QR code base64) de um boleto específico
export const fetchPixForBoleto = async (
  companyId: number,
  paymentId: string,
  nodeToken?: string | null,
  environment?: string | null
): Promise<{ payload?: string; encodedImage?: string } | null> => {
  const { token } = await resolveAsaasToken(companyId, nodeToken);
  if (!token) return null;
  const BASE_URL = resolveBaseUrl(environment);
  try {
    const resp = await axios.get(`${BASE_URL}/payments/${paymentId}/pixQrCode`, {
      headers: buildHeaders(token),
      timeout: 15000
    });
    return { payload: resp.data?.payload, encodedImage: resp.data?.encodedImage };
  } catch (err: any) {
    logger.warn(`[ASAAS] PIX QR indisponível para ${paymentId}: ${err?.response?.status || err?.message}`);
    return null;
  }
};

// Substitui placeholders {{var}} de um template de boleto
export const renderBoletoTemplate = (
  template: string,
  boleto: AsaasBoleto,
  index: number
): string => {
  const valor = boleto.value?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "";
  const venc = boleto.dueDate ? boleto.dueDate.split("-").reverse().join("/") : "";
  const statusMap: Record<string, string> = {
    PENDING: "Pendente",
    OVERDUE: "Vencido",
    RECEIVED: "Pago",
    CONFIRMED: "Confirmado"
  };
  const vars: Record<string, string> = {
    indice: String(index + 1),
    valor,
    vencimento: venc,
    status: statusMap[boleto.status] || boleto.status || "",
    descricao: boleto.description || "Fatura",
    linkBoleto: boleto.invoiceUrl || boleto.bankSlipUrl || "",
    linhaDigitavel: boleto.identificationField || "",
    nossoNumero: boleto.nossoNumero || "",
    pixCopiaCola: boleto.pixCopyPaste || ""
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
    vars[k] !== undefined ? vars[k] : ""
  );
};

export const formatBoletosMessage = (boletos: AsaasBoleto[]): string => {
  if (!boletos.length) return "";
  const lines: string[] = ["*Segunda via dos seus boletos:*", ""];
  boletos.forEach((b, i) => {
    const valor = b.value?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const venc = b.dueDate ? b.dueDate.split("-").reverse().join("/") : "";
    lines.push(`*${i + 1}.* ${b.description || "Fatura"}`);
    lines.push(`Valor: ${valor}`);
    lines.push(`Vencimento: ${venc}`);
    lines.push(`Status: ${b.status}`);
    if (b.invoiceUrl) lines.push(`Link: ${b.invoiceUrl}`);
    lines.push("");
  });
  return lines.join("\n").trim();
};