import Whatsapp from "../../models/Whatsapp";
import { getWbot } from "../../libs/wbot";
import { getWhatsAppOficialHealth } from "./GetWhatsAppOficialHealthService";

/**
 * RELATÓRIO DE QUALIDADE / SAÚDE DO NÚMERO — por conexão
 *
 * O que dá para saber depende do TIPO de conexão, e é importante ser honesto:
 *
 *  • API OFICIAL (Meta Cloud): a Meta expõe qualidade de verdade — quality
 *    rating (verde/amarelo/vermelho), tier de limite de mensagens, status de
 *    revisão da conta e verificação do negócio. Isso vem do serviço oficial que
 *    já existe.
 *
 *  • BAILEYS (WhatsApp gratuito): NÃO existe API oficial de "qualidade" nem de
 *    "banimento". O que dá para reportar com honestidade são os SINAIS REAIS da
 *    sessão: se está conectada, o JID/LID, pushName, plataforma, e o motivo da
 *    última queda interpretado (deslogado / bloqueado / conflito / offline).
 *    Não inventamos "quality rating" nem "capping" aqui — seria dado falso.
 *
 * O front decide o layout conforme o campo `channelKind`.
 */

interface QualityReport {
  whatsappId: number;
  name: string;
  channel: string;
  channelKind: "official" | "baileys" | "other";
  checkedAt: string;
  // veredito unificado para o topo do modal
  verdict: "healthy" | "warning" | "critical" | "unknown";
  verdictReason: string;
  // bloco conexão (comum)
  connection: {
    status: string;
    online: boolean;
    number: string | null;
    jid: string | null;
    lid: string | null;
    pushName: string | null;
    platform: string | null;
    loggedIn: boolean | null;
  };
  // bloco oficial (só API oficial)
  official?: any;
  // observações honestas sobre o que o tipo de conexão expõe
  notes: string[];
}

const interpretarStatus = (status: string): { online: boolean; verdict: QualityReport["verdict"]; reason: string } => {
  const s = (status || "").toUpperCase();
  if (s === "CONNECTED") return { online: true, verdict: "healthy", reason: "Conexão ativa e sem restrição detectada." };
  if (s === "PENDING" || s === "OPENING" || s === "PAIRING" || s === "QRCODE" || s === "TIMEOUT")
    return { online: false, verdict: "warning", reason: "Conexão não estabelecida no momento." };
  if (s === "DISCONNECTED") return { online: false, verdict: "warning", reason: "Conexão offline." };
  return { online: false, verdict: "unknown", reason: "Estado desconhecido." };
};

const GetWhatsappQualityService = async (
  whatsappId: number,
  companyId: number
): Promise<QualityReport> => {
  const whatsapp = await Whatsapp.findOne({ where: { id: whatsappId, companyId } });
  if (!whatsapp) {
    throw new Error("ERR_NO_WHATSAPP_FOUND");
  }

  const channel = whatsapp.channel || "whatsapp";
  const isOfficial = !!whatsapp.phone_number_id || channel === "whatsapp_oficial" || channel === "official";
  const channelKind: QualityReport["channelKind"] = isOfficial
    ? "official"
    : channel === "whatsapp" || channel === "baileys" || channel === "wacalls"
    ? "baileys"
    : "other";

  const base = interpretarStatus(whatsapp.status);

  const report: QualityReport = {
    whatsappId: whatsapp.id,
    name: whatsapp.name,
    channel,
    channelKind,
    checkedAt: new Date().toISOString(),
    verdict: base.verdict,
    verdictReason: base.reason,
    connection: {
      status: whatsapp.status,
      online: base.online,
      number: whatsapp.number || null,
      jid: null,
      lid: null,
      pushName: null,
      platform: null,
      loggedIn: null
    },
    notes: []
  };

  // ---- API OFICIAL: puxa a qualidade real da Meta ----
  if (channelKind === "official") {
    try {
      const health: any = await getWhatsAppOficialHealth(whatsappId, companyId);
      report.official = health;

      // Traduz o quality_rating da Meta no veredito do topo.
      const q = (health?.quality_rating || health?.qualityRating || "").toString().toUpperCase();
      const review = (health?.account_review_status || "").toString().toUpperCase();
      if (review && review !== "APPROVED") {
        report.verdict = "critical";
        report.verdictReason = "Conta em revisão pela Meta.";
      } else if (q === "RED") {
        report.verdict = "critical";
        report.verdictReason = "Qualidade BAIXA (vermelho) na Meta — risco de restrição.";
      } else if (q === "YELLOW") {
        report.verdict = "warning";
        report.verdictReason = "Qualidade MÉDIA (amarelo) na Meta.";
      } else if (q === "GREEN") {
        report.verdict = "healthy";
        report.verdictReason = "Qualidade ALTA (verde) na Meta.";
      }
      report.connection.number = health?.display_phone_number || report.connection.number;
    } catch (e: any) {
      report.notes.push(
        "Não foi possível consultar a qualidade oficial na Meta agora. Verifique o token da conta e tente novamente."
      );
    }
    report.notes.push(
      "Números da API Oficial têm qualidade e limites medidos pela própria Meta (verde/amarelo/vermelho, tier de mensagens, revisão da conta)."
    );
    return report;
  }

  // ---- BAILEYS: sinais reais da sessão (sem inventar qualidade) ----
  if (channelKind === "baileys") {
    try {
      const wbot: any = getWbot(whatsapp.id);
      const u = wbot?.user;
      if (u?.id) {
        report.connection.jid = u.id;
        report.connection.pushName = u.name || u.notify || null;
        report.connection.loggedIn = true;
        report.connection.online = true;
      }
      report.connection.lid = wbot?.myLid || u?.lid || null;
      report.connection.platform = wbot?.platform || u?.platform || null;
    } catch (e) {
      // Sem socket vivo — a conexão está offline; os campos ficam nulos.
      report.connection.loggedIn = false;
    }

    // Notas honestas sobre o que o WhatsApp gratuito expõe.
    report.notes.push(
      "WhatsApp gratuito (Baileys) não possui API oficial de qualidade ou de banimento. O que mostramos aqui são os sinais reais da sessão."
    );
    report.notes.push(
      "Sinais de bloqueio/suspensão só aparecem quando a sessão é derrubada com motivo específico (deslogado, acesso negado/403 ou conflito de sessão)."
    );
    report.notes.push(
      "Boas práticas para preservar o número: evitar disparos em massa fora de campanha, respeitar intervalos anti-ban e não enviar para quem não tem conversa aberta."
    );

    if (!report.connection.online) {
      report.verdict = report.verdict === "healthy" ? "warning" : report.verdict;
      report.verdictReason = "Número offline no momento — reconecte para avaliar a sessão.";
    }
    return report;
  }

  // ---- OUTROS canais (Z-API, telegram, webchat...) ----
  report.notes.push(
    "Este canal não expõe métricas de qualidade de número do WhatsApp. Mostramos apenas o estado da conexão."
  );
  return report;
};

export default GetWhatsappQualityService;
