import { Op } from "sequelize";
import TicketTag from "../../models/TicketTag";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import ShowTicketService from "../TicketServices/ShowTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import SendWhatsAppMedia from "../WbotServices/SendWhatsAppMedia";
import SendWhatsAppOficialMessage from "../WhatsAppOficial/SendWhatsAppOficialMessage";
import { sendFacebookMessage } from "../FacebookServices/sendFacebookMessage";
import { sendTelegramMessage } from "../TelegramServices/sendTelegramMessage";
import { SendMessage } from "../../helpers/SendMessage";
import formatBody from "../../helpers/Mustache";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";

interface Request {
  ticketId: number;
  companyId: number;
  tagId: number;
  /**
   * Enviar a "Mensagem de saudação da lane" configurada na etapa.
   * Padrão true (comportamento do nó de Kanban e do arrastar manual).
   * O nó de encerrar passa false: o cliente já recebeu a despedida, e uma
   * coluna de arquivamento como "Perdido" é classificação interna.
   */
  enviarSaudacao?: boolean;
}

/**
 * Envia a "Mensagem de saudação da lane" configurada na etapa do Kanban.
 *
 * Quando o operador ARRASTA um card no quadro, quem manda essa mensagem é o
 * TicketTagController.store. O nó de Kanban do FlowBuilder movia o ticket
 * direto pela tabela TicketTag e por isso pulava esse envio — o cliente era
 * movido de coluna em silêncio, e a mensagem que o usuário escreveu na tela
 * de editar a lane nunca saía.
 *
 * Falha aqui não interrompe a movimentação: mover o card é o efeito
 * principal do nó, a saudação é consequência.
 */
const enviarSaudacaoDaLane = async (
  tag: Tag,
  ticketId: number,
  companyId: number
): Promise<void> => {
  const texto = tag.greetingMessageLane;
  if (!texto || !String(texto).trim()) return;

  try {
    const ticket = await ShowTicketService(ticketId, companyId);

    // Mesmo formato do arrastar manual: prefixa o nome do atendente quando
    // o ticket já tem um responsável.
    const corpoBruto = ticket.user
      ? `*${ticket.user.name}:*\n${texto}`
      : String(texto);
    // formatBody resolve as variáveis ({{name}}, {{protocol}} etc.), que no
    // FlowBuilder são de uso comum.
    const corpo = formatBody(corpoBruto, ticket);

    const midias: any[] = (() => {
      if (!tag.mediaFiles) return [];
      try {
        const parsed = JSON.parse(tag.mediaFiles);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();

    if (ticket.channel === "whatsapp") {
      await SendWhatsAppMessage({ body: corpo, ticket });
      for (const midia of midias) {
        try {
          await SendWhatsAppMedia({ media: midia, ticket });
        } catch (e: any) {
          logger.warn(`[KANBAN NODE] Falha ao enviar mídia da lane: ${e?.message}`);
        }
      }
      return;
    }

    if (ticket.channel === "whatsapp_oficial") {
      await SendWhatsAppOficialMessage({
        body: corpo,
        ticket,
        quotedMsg: null,
        type: "text",
        media: null,
        vCard: null
      } as any);
      for (const midia of midias) {
        try {
          await SendWhatsAppOficialMessage({
            body: "",
            ticket,
            type: String(midia.mimetype || "").split("/")[0],
            media: {
              fieldname: "medias",
              originalname: midia.originalname,
              encoding: "7bit",
              mimetype: midia.mimetype,
              filename: midia.filename,
              path: midia.path
            }
          } as any);
        } catch (e: any) {
          logger.warn(`[KANBAN NODE] Falha ao enviar mídia da lane: ${e?.message}`);
        }
      }
      return;
    }

    // WhatsApp Plus. O TicketTagController (arrastar manual) não trata esse
    // canal e por isso a saudação nunca saía nele; aqui vai pelo helper
    // SendMessage, que resolve wacalls internamente.
    if (ticket.channel === "wacalls") {
      const whatsapp = await ShowWhatsAppService(ticket.whatsappId, companyId);
      await SendMessage(whatsapp, {
        number: ticket.contact.number,
        body: corpo
      });
      return;
    }

    if (["facebook", "instagram"].includes(ticket.channel)) {
      await sendFacebookMessage({ body: `\u200e ${corpo}`, ticket } as any);
      return;
    }

    if (ticket.channel === "telegram") {
      await sendTelegramMessage({ body: corpo, ticket } as any);
    }
  } catch (err: any) {
    logger.warn(
      `[KANBAN NODE] Ticket ${ticketId} movido, mas falhou ao enviar a saudação da lane: ${err?.message}`
    );
  }
};

/**
 * Move um ticket para uma etapa (lane) do Kanban a partir do FlowBuilder.
 *
 * O Kanban deste sistema não tem uma tabela própria de "etapa": cada coluna
 * do quadro é uma Tag com kanban=1, e o card estar numa coluna significa que
 * o ticket tem aquela tag (ver frontend/src/pages/Kanban/index.js,
 * handleCardMove). Por isso mover = trocar a tag de kanban do ticket, que é
 * exatamente o que TicketTagController.store/remove fazem quando o operador
 * arrasta um card na tela.
 *
 * Mesma regra de exclusividade do arrastar manual: só as tags com kanban=1
 * são removidas, para não apagar tags comuns (etiquetas de organização) que
 * o ticket tenha por outros motivos.
 */
/**
 * Tira o MESMO CONTATO de lanes ocupadas por tickets antigos e ja encerrados.
 *
 * O PROBLEMA QUE ISSO RESOLVE
 * A lane do Kanban e uma tag presa ao TICKET, mas o funil, do ponto de vista
 * de quem usa, e do CONTATO. Os dois so coincidem enquanto o atendimento e o
 * mesmo.
 *
 * Sequencia real: o no de encerrar fecha o ticket 100 e o marca "Perdido".
 * O quadro continua mostrando esse card porque o ListTicketsServiceKanban
 * inclui de proposito os tickets `closed` que tenham tag de kanban (ver
 * `idsDeTicketsArquivados` la). Quando o cliente volta a escrever depois da
 * janela de reabertura, o FindOrCreateTicketService cria o ticket 101 — novo,
 * sem tag nenhuma. Um no de Kanban seguinte move o 101 para outra etapa, e a
 * limpeza de tags acima roda so no 101. O 100 segue em "Perdido".
 *
 * Resultado na tela: o contato aparece em duas colunas ao mesmo tempo, e o
 * card de "Perdido" nunca sai — que e exatamente o sintoma relatado.
 *
 * POR QUE AGORA VALE PARA QUALQUER STATUS
 * A primeira versao desta limpeza so mexia em ticket `closed`, com o
 * argumento de que um ticket vivo em outra conexao poderia estar sendo
 * trabalhado por alguem. Na pratica isso deixou o problema pela metade: o
 * FindOrCreateTicketService REABRE o ticket antigo como `pending` quando o
 * cliente volta a escrever, entao o card parado em "Perdido" quase nunca
 * estava com status `closed` — estava `pending`, e escapava do filtro.
 *
 * Resultado: um contato com quatro atendimentos acabava em quatro colunas ao
 * mesmo tempo, que e o "esta duplicando ao mover".
 *
 * A regra passa a ser a que o funil pressupoe: um contato ocupa UMA coluna.
 * O ticket que acabou de ser movido manda; os demais saem das lanes.
 *
 * OBSERVACAO SOBRE O CASO RARO
 * Se o mesmo contato tiver dois atendimentos vivos em conexoes diferentes,
 * um deles perde a lane ao mover o outro. E o preco de tratar o funil como
 * do contato — e e o comportamento que o usuario espera ao ver o quadro.
 */
export const limparLanesDeOutrosTicketsDoContato = async (
  ticketAtual: Ticket,
  companyId: number,
  idsDeTagsDeKanban?: number[]
): Promise<void> => {
  if (!ticketAtual?.contactId) return;

  // Quem chama de fora (o arrastar manual) nao tem a lista pronta.
  const idsDeKanban =
    idsDeTagsDeKanban && idsDeTagsDeKanban.length > 0
      ? idsDeTagsDeKanban
      : (
          await Tag.findAll({
            where: { companyId, kanban: 1 },
            attributes: ["id"]
          })
        ).map(t => t.id);

  if (idsDeKanban.length === 0) return;

  try {
    const outrosTickets = await Ticket.findAll({
      where: {
        contactId: ticketAtual.contactId,
        companyId,
        // Sem filtro de status: o ticket antigo parado numa lane costuma
        // estar `pending` (reaberto), nao `closed`.
        id: { [Op.ne]: ticketAtual.id }
      },
      attributes: ["id"]
    });

    if (outrosTickets.length === 0) return;

    const idsDosOutros = outrosTickets.map(t => t.id);

    const vinculos = await TicketTag.findAll({
      where: {
        ticketId: { [Op.in]: idsDosOutros },
        tagId: { [Op.in]: idsDeKanban }
      }
    });

    if (vinculos.length === 0) return;

    const idsAfetados = [...new Set(vinculos.map(v => v.ticketId))];

    await TicketTag.destroy({
      where: {
        ticketId: { [Op.in]: idsAfetados },
        tagId: { [Op.in]: idsDeKanban }
      }
    });

    logger.info(
      `[KANBAN] Contato ${ticketAtual.contactId}: removida a lane de ${idsAfetados.length} outro(s) ticket(s) (${idsAfetados.join(", ")}) ao mover o ticket ${ticketAtual.id}`
    );

    // Sem avisar a tela, o card fantasma so some depois de um F5 — e a
    // impressao para quem usa continua sendo "nao saiu do Perdido".
    const io = getIO();
    for (const id of idsAfetados) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const antigo = await ShowTicketService(id, companyId);
        io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
          action: "update",
          ticket: antigo
        });
      } catch {
        // Um ticket que nao carrega nao pode impedir os outros.
      }
    }
  } catch (err: any) {
    // Best-effort: a movimentacao principal ja aconteceu e nao pode ser
    // desfeita por causa da limpeza do historico.
    logger.warn(
      `[KANBAN] Falha ao limpar lanes antigas do contato ${ticketAtual?.contactId}: ${err?.message}`
    );
  }
};

const MoveTicketToKanbanService = async ({
  ticketId,
  companyId,
  tagId,
  enviarSaudacao = true
}: Request): Promise<void> => {
  const tag = await Tag.findOne({ where: { id: tagId, companyId } });

  if (!tag) {
    throw new Error(`Etapa do Kanban (tag ${tagId}) não encontrada.`);
  }

  // Todas as tags de kanban da empresa: servem tanto para a limpeza do
  // proprio ticket quanto para a dos tickets antigos do mesmo contato.
  const tagsDeKanbanDaEmpresa = await Tag.findAll({
    where: { companyId, kanban: 1 },
    attributes: ["id"]
  });
  const idsDeTagsDeKanban = tagsDeKanbanDaEmpresa.map(t => t.id);

  // Remove apenas as tags de kanban que o ticket já tenha — uma coluna por
  // vez, igual ao comportamento do quadro.
  if (idsDeTagsDeKanban.length > 0) {
    await TicketTag.destroy({
      where: { ticketId, tagId: { [Op.in]: idsDeTagsDeKanban } }
    });
  }

  await TicketTag.create({ ticketId, tagId });

  // Atualiza a tela de quem estiver com o quadro/atendimento aberto, senão
  // o card só aparece na coluna nova depois de um F5.
  let ticketMovido: Ticket | null = null;
  try {
    ticketMovido = await ShowTicketService(ticketId, companyId);
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket: ticketMovido
    });
  } catch (err) {
    logger.warn(
      `[KANBAN NODE] Ticket ${ticketId} movido, mas falhou ao emitir atualização em tela: ${err}`
    );
  }

  // Um contato só pode ocupar uma coluna do funil. Se atendimentos anteriores
  // dele ficaram parados numa lane, saem agora.
  if (ticketMovido) {
    await limparLanesDeOutrosTicketsDoContato(
      ticketMovido,
      companyId,
      idsDeTagsDeKanban
    );
  }

  logger.info(
    `[KANBAN NODE] Ticket ${ticketId} movido para a etapa "${tag.name}" (tag ${tagId})`
  );

  // Depois de mover e avisar a tela: manda a saudação configurada na lane.
  if (enviarSaudacao) {
    await enviarSaudacaoDaLane(tag, ticketId, companyId);
  }
};

/**
 * Tira o ticket de qualquer coluna do Kanban.
 *
 * Usado pelo nó de encerrar do FlowBuilder: um atendimento fechado não deve
 * continuar ocupando uma etapa do funil. O quadro já filtra por status
 * pending/open, então o card some da tela sozinho — mas a linha em TicketTag
 * continuava lá, e o ticket voltava para a coluna antiga assim que fosse
 * reaberto. Removendo a tag, um atendimento reaberto entra no funil de novo
 * pelo começo, em vez de reaparecer no meio dele.
 *
 * Só mexe em tags com kanban=1: etiquetas comuns do ticket são preservadas.
 */
export const RemoveTicketFromKanban = async (
  ticketId: number,
  companyId: number
): Promise<void> => {
  try {
    const tagsDoTicket = await TicketTag.findAll({ where: { ticketId } });
    const idsDasTags = tagsDoTicket.map(t => t.tagId);
    if (idsDasTags.length === 0) return;

    const tagsDeKanban = await Tag.findAll({
      where: { id: idsDasTags, kanban: 1, companyId }
    });
    const idsDeKanban = tagsDeKanban.map(t => t.id);
    if (idsDeKanban.length === 0) return;

    await TicketTag.destroy({ where: { ticketId, tagId: idsDeKanban } });

    logger.info(
      `[KANBAN] Ticket ${ticketId} removido do Kanban (${idsDeKanban.length} etapa(s)) ao ser encerrado`
    );
  } catch (err: any) {
    // Best-effort: não pode impedir o encerramento do atendimento.
    logger.warn(
      `[KANBAN] Falha ao remover o ticket ${ticketId} do Kanban: ${err?.message}`
    );
  }
};

export default MoveTicketToKanbanService;
