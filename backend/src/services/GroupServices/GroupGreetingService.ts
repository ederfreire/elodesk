import Mustache from "mustache";
import { Op } from "sequelize";

import GroupGreeting from "../../models/GroupGreeting";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import Company from "../../models/Company";
import logger from "../../utils/logger";
import { msgsd, hour, date } from "../../helpers/Mustache";

// ATENÇÃO — não transforme os require() abaixo em import de topo.
//
// getWbot vem de libs/wbot, e libs/wbot importa DE VOLTA o
// wbotMessageListener (getTypeMessage/isValidMsg). Como o
// wbotMessageListener é quem importa este arquivo, um import de topo aqui
// fecha o ciclo:
//
//   wbotMessageListener → GroupGreetingService → libs/wbot → wbotMessageListener
//
// Em CommonJS, o módulo que fecha o ciclo recebe um objeto parcialmente
// inicializado. Isso quebrou a recepção de mensagens em produção. Carregar
// só na hora do uso mantém o ciclo desfeito — nenhuma dessas funções é
// necessária no carregamento do módulo.
/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const carregarWbot = () =>
  require("../../libs/wbot").getWbot as (id: number) => any;

const carregarSendChatText = () =>
  require("../WacallsServices/WacallsChatMessageService").sendChatText as (
    sessionId: string,
    jid: string,
    text: string
  ) => Promise<any>;

const carregarWacallsGet = () =>
  require("../WacallsServices/WacallsChatCallService").get as <T>(
    path: string
  ) => Promise<T>;

/**
 * Saudação para quem entra num grupo.
 *
 * Funciona igual para as duas conexões que têm grupo de verdade — Baileys
 * ("whatsapp") e WhatsApp Plus ("wacalls"). A diferença fica toda concentrada
 * em `enviarTexto` e na menção: o Baileys aceita `mentions` na mensagem, o
 * wacalls-chat ainda não expõe isso pelo endpoint de envio simples, então
 * naquele canal o nome sai como texto normal (a mensagem chega igual, só não
 * fica com o link azul de marcação).
 */

// Variáveis aceitas na mensagem. Mantidas no mesmo estilo {{...}} do resto da
// plataforma (Mustache), com apelidos em português e inglês pra ninguém ter
// que decorar qual é qual.
export const GROUP_GREETING_VARIABLES: {
  key: string;
  label: string;
  example: string;
}[] = [
  { key: "nome", label: "Nome de quem entrou", example: "Maria Silva" },
  {
    key: "mencao",
    label: "Marca o novo membro (@numero)",
    example: "@5511999999999"
  },
  { key: "primeiro_nome", label: "Primeiro nome", example: "Maria" },
  { key: "numero", label: "Número de quem entrou", example: "5511999999999" },
  { key: "grupo", label: "Nome do grupo", example: "Clientes VIP" },
  { key: "total_membros", label: "Total de membros do grupo", example: "42" },
  { key: "saudacao", label: "Bom dia / Boa tarde / Boa noite", example: "Boa tarde" },
  { key: "hora", label: "Hora atual", example: "14:35:02" },
  { key: "data", label: "Data atual", example: "02-08-2026" },
  { key: "conexao", label: "Nome da conexão", example: "Comercial" },
  { key: "empresa", label: "Nome da empresa", example: "Atendah" }
];

interface Participante {
  jid: string;
  numero: string;
  nome?: string | null;
}

interface MontarParams {
  template: string;
  participante: Participante;
  nomeGrupo: string;
  totalMembros: number | null;
  nomeConexao: string;
  nomeEmpresa: string;
}

const soDigitos = (v: string): string => String(v || "").replace(/\D/g, "");

const jidParaNumero = (jid: string): string =>
  soDigitos(String(jid || "").split("@")[0].split(":")[0]);

/**
 * Troca as variáveis pelo conteúdo real.
 * Falha de template (chave malformada, chave fechada errado) NÃO pode
 * derrubar a entrada no grupo — nesse caso devolve o texto cru.
 */
export const montarSaudacao = ({
  template,
  participante,
  nomeGrupo,
  totalMembros,
  nomeConexao,
  nomeEmpresa
}: MontarParams): string => {
  const nome = participante.nome || participante.numero;
  const primeiro = String(nome).split(" ")[0];

  const view: Record<string, string> = {
    nome,
    name: nome,
    primeiro_nome: primeiro,
    firstName: primeiro,
    numero: participante.numero,
    number: participante.numero,
    // Pra o WhatsApp DESENHAR a marcação (nome em azul, clicável), o texto
    // precisa conter "@numero" — só mandar o jid na lista de mentions
    // notifica a pessoa mas não mostra nada. Esta variável existe pra isso.
    mencao: `@${participante.numero}`,
    mention: `@${participante.numero}`,
    grupo: nomeGrupo || "",
    group: nomeGrupo || "",
    total_membros: totalMembros === null ? "" : String(totalMembros),
    saudacao: msgsd(),
    ms: msgsd(),
    hora: hour(),
    hour: hour(),
    data: date(),
    date: date(),
    conexao: nomeConexao || "",
    connection: nomeConexao || "",
    empresa: nomeEmpresa || "",
    name_company: nomeEmpresa || ""
  };

  try {
    return Mustache.render(template || "", view);
  } catch (err: any) {
    logger.warn(
      `[GroupGreeting] Template inválido, enviando texto cru: ${err?.message}`
    );
    return template || "";
  }
};

/** Envia um texto simples pelo canal certo. */
const enviarTexto = async (
  whatsapp: Whatsapp,
  jid: string,
  texto: string,
  mencionar?: string[]
): Promise<void> => {
  if (whatsapp.channel === "wacalls") {
    if (!whatsapp.wacallsChatSessionId) {
      throw new Error("conexão WhatsApp Plus sem sessão pareada");
    }
    await carregarSendChatText()(whatsapp.wacallsChatSessionId, jid, texto);
    return;
  }

  const wbot = carregarWbot()(whatsapp.id);
  if (mencionar && mencionar.length > 0) {
    await wbot.sendMessage(jid, { text: texto, mentions: mencionar });
  } else {
    await wbot.sendMessage(jid, { text: texto });
  }
};

/** Nome e tamanho do grupo, sem derrubar nada se a consulta falhar. */
const dadosDoGrupo = async (
  whatsapp: Whatsapp,
  groupJid: string
): Promise<{ nome: string; total: number | null }> => {
  try {
    if (whatsapp.channel === "wacalls") {
      if (!whatsapp.wacallsChatSessionId) return { nome: "", total: null };
      const info = await carregarWacallsGet()<any>(
        `/api/sessions/${whatsapp.wacallsChatSessionId}/groups/${encodeURIComponent(groupJid)}`
      );
      return {
        nome: info?.subject || "",
        total: Array.isArray(info?.participants) ? info.participants.length : null
      };
    }
    const wbot = carregarWbot()(whatsapp.id);
    const meta = await wbot.groupMetadata(groupJid);
    return {
      nome: meta?.subject || "",
      total: Array.isArray(meta?.participants) ? meta.participants.length : null
    };
  } catch (err: any) {
    logger.warn(
      `[GroupGreeting] Não consegui ler dados do grupo ${groupJid}: ${err?.message}`
    );
    return { nome: "", total: null };
  }
};

interface EnviarParams {
  companyId: number;
  whatsappId: number;
  groupJid: string;
  participantJids: string[];
}

/**
 * Chamado quando o WhatsApp avisa que entraram participantes no grupo.
 * Silencioso por natureza: se não houver saudação configurada, não faz nada.
 */
export const SendGroupGreetingService = async ({
  companyId,
  whatsappId,
  groupJid,
  participantJids
}: EnviarParams): Promise<void> => {
  if (!participantJids || participantJids.length === 0) return;

  // Log em cada ponto de desistência. Sem isso, "a saudação não funcionou"
  // vira adivinhação: não dá pra saber se o evento nem chegou, se não havia
  // configuração, ou se o envio falhou.
  logger.info(
    `[GroupGreeting] entrada detectada: empresa=${companyId} conexao=${whatsappId} ` +
      `grupo=${groupJid} novos=${participantJids.length}`
  );

  const config = await GroupGreeting.findOne({
    where: { companyId, whatsappId, groupJid }
  });

  if (!config) {
    logger.info(
      `[GroupGreeting] sem configuração salva pra ${groupJid} na conexão ${whatsappId} — ignorado`
    );
    return;
  }
  if (!config.enabled) {
    logger.info(`[GroupGreeting] saudação desativada pra ${groupJid} — ignorado`);
    return;
  }

  const template = String(config.message || "").trim();
  if (!template) {
    logger.info(`[GroupGreeting] mensagem vazia pra ${groupJid} — ignorado`);
    return;
  }
  if (!config.sendInGroup && !config.sendInPrivate) {
    logger.info(`[GroupGreeting] nenhum destino marcado pra ${groupJid} — ignorado`);
    return;
  }

  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (!whatsapp) return;

  const company = await Company.findByPk(companyId, { attributes: ["name"] });
  const grupo = await dadosDoGrupo(whatsapp, groupJid);

  // Nome de quem entrou: só temos o número pelo evento, então busca o contato
  // já cadastrado. Sem contato, a mensagem usa o próprio número.
  const numeros = participantJids.map(jidParaNumero).filter(Boolean);
  const contatos = await Contact.findAll({
    where: { companyId, number: { [Op.in]: numeros } },
    attributes: ["number", "name"]
  });
  const mapaNomes = new Map<string, string>();
  for (const c of contatos) mapaNomes.set(c.number, c.name);

  for (const jid of participantJids) {
    const numero = jidParaNumero(jid);
    if (!numero) continue;

    const participante: Participante = {
      jid,
      numero,
      nome: mapaNomes.get(numero) || null
    };

    const texto = montarSaudacao({
      template,
      participante,
      nomeGrupo: grupo.nome,
      totalMembros: grupo.total,
      nomeConexao: whatsapp.name,
      nomeEmpresa: company?.name || ""
    });

    if (!texto.trim()) continue;

    if (config.sendInGroup) {
      try {
        await enviarTexto(whatsapp, groupJid, texto, [jid]);
        logger.info(
          `[GroupGreeting] Saudação enviada no grupo ${groupJid} para ${numero}`
        );
      } catch (err: any) {
        logger.warn(
          `[GroupGreeting] Falha ao saudar no grupo ${groupJid}: ${err?.message}`
        );
      }
    }

    if (config.sendInPrivate) {
      try {
        // Quem nunca falou com o número pode simplesmente não receber — o
        // WhatsApp descarta em silêncio ou devolve erro. Por isso o envio no
        // privado é isolado do envio no grupo: um não derruba o outro.
        await enviarTexto(whatsapp, `${numero}@s.whatsapp.net`, texto);
        logger.info(`[GroupGreeting] Saudação enviada no privado de ${numero}`);
      } catch (err: any) {
        logger.warn(
          `[GroupGreeting] Falha ao saudar ${numero} no privado: ${err?.message}`
        );
      }
    }
  }
};

export default SendGroupGreetingService;
