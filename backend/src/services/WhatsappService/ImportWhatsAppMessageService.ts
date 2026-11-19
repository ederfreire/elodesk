import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import { Op } from "sequelize";
import { add } from "date-fns";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import { dataMessages, getWbot } from "../../libs/wbot";
import { handleMessage } from "../WbotServices/wbotMessageListener";
import moment from "moment";
import { addLogs } from "../../helpers/addLogs";

// Cancellation flags for native Baileys import
const cancelledNativeImports = new Map<number, boolean>();

export const cancelNativeImport = (companyId: number) => {
  cancelledNativeImports.set(companyId, true);
};

const isNativeCancelled = (companyId: number): boolean => {
  return cancelledNativeImports.get(companyId) === true;
};

export const closeTicketsImported = async (whatsappId) => {
  const tickets = await Ticket.findAll({
    where: {
      status: 'pending',
      whatsappId,
      imported: { [Op.lt]: +add(new Date(), { hours: +5 }) }
    }
  });

  for (const ticket of tickets) {
    await new Promise(r => setTimeout(r, 330));
    await UpdateTicketService({
      ticketData: { status: "closed" },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });
  }

  let whatsApp = await Whatsapp.findByPk(whatsappId);
  whatsApp.update({ statusImportMessages: null });

  const io = getIO();
  io.of(whatsApp.companyId.toString())
    .emit(`importMessages-${whatsApp.companyId}`, {
      action: "refresh",
    });
};

function sortByMessageTimestamp(a, b) {
  return getTimestampSafe(b) - getTimestampSafe(a);
}

// ✅ FIX: Extrair timestamp de forma segura (Long ou number)
function getTimestampSafe(msg: any): number {
  const ts = msg?.messageTimestamp;
  if (!ts) return 0;
  if (typeof ts === "object" && ts !== null) {
    if (typeof ts.low === "number") return ts.low;
    if (typeof ts.toNumber === "function") return ts.toNumber();
  }
  if (typeof ts === "number") return ts;
  const parsed = parseInt(String(ts), 10);
  return isNaN(parsed) ? 0 : parsed;
}

function cleaner(array) {
  const mapa = new Map();
  const resultado = [];

  for (const objeto of array) {
    const valorChave = objeto['key']['id'];
    if (!mapa.has(valorChave)) {
      mapa.set(valorChave, true);
      resultado.push(objeto);
    }
  }

  return resultado.sort(sortByMessageTimestamp);
}

const ImportWhatsAppMessageService = async (whatsappId: number | string) => {
  let whatsApp = await Whatsapp.findByPk(whatsappId);
  const wbot = getWbot(whatsApp.id);

  // Clear any previous cancellation
  cancelledNativeImports.delete(whatsApp.companyId);

  try {
    const io = getIO();
    const messages = cleaner(dataMessages[whatsappId]);
    let dateOldLimit = new Date(whatsApp.importOldMessages).getTime();
    let dateRecentLimit = new Date(whatsApp.importRecentMessages).getTime();

    addLogs({
      fileName: `processImportMessagesWppId${whatsappId}.txt`,
      forceNewFile: true,
      text: `Aguardando conexão para iniciar a importação de mensagens:
  Whatsapp nome: ${whatsApp.name}
  Whatsapp Id: ${whatsApp.id}
  Criação do arquivo de logs: ${moment().format("DD/MM/YYYY HH:mm:ss")}
  Selecionado Data de inicio de importação: ${moment(dateOldLimit).format("DD/MM/YYYY HH:mm:ss")}
  Selecionado Data final da importação: ${moment(dateRecentLimit).format("DD/MM/YYYY HH:mm:ss")}
  `
    });

    const qtd = messages.length;
    let i = 0;
    let errorCount = 0;

    while (i < qtd) {
      // Check cancellation
      if (isNativeCancelled(whatsApp.companyId)) {
        addLogs({
          fileName: `processImportMessagesWppId${whatsappId}.txt`,
          text: `Importação cancelada pelo usuário na mensagem ${i + 1} de ${qtd}`
        });

        dataMessages[whatsappId] = [];
        await whatsApp.update({
          statusImportMessages: null,
          importOldMessages: null,
          importRecentMessages: null
        });

        io.of(whatsApp.companyId.toString())
          .emit(`importMessages-${whatsApp.companyId}`, {
            action: "update",
            status: { this: i, all: qtd, errors: errorCount, cancelled: true }
          });

        // Small delay then refresh
        setTimeout(() => {
          io.of(whatsApp.companyId.toString())
            .emit(`importMessages-${whatsApp.companyId}`, { action: "refresh" });
        }, 3000);

        cancelledNativeImports.delete(whatsApp.companyId);
        return "cancelled";
      }

      try {
        const msg = messages[i];
        addLogs({
          fileName: `processImportMessagesWppId${whatsappId}.txt`,
          text: `
Mensagem ${i + 1} de ${qtd}
  `
        });

        await handleMessage(msg, wbot, whatsApp.companyId, true);

        if (i % 2 === 0) {
          const timestampMsg = Math.floor(getTimestampSafe(msg) * 1000);
          io.of(whatsApp.companyId.toString())
            .emit(`importMessages-${whatsApp.companyId}`, {
              action: "update",
              status: {
                this: i + 1,
                all: qtd,
                date: moment(timestampMsg).format("DD/MM/YY HH:mm:ss"),
                errors: errorCount
              }
            });
        }

        if (i + 1 === qtd) {
          dataMessages[whatsappId] = [];

          if (whatsApp.closedTicketsPostImported) {
            await closeTicketsImported(whatsappId);
          }

          await whatsApp.update({
            statusImportMessages: whatsApp.closedTicketsPostImported
              ? null
              : "renderButtonCloseTickets",
            importOldMessages: null,
            importRecentMessages: null
          });

          io.of(whatsApp.companyId.toString())
            .emit(`importMessages-${whatsApp.companyId}`, {
              action: "refresh",
            });
        }
      } catch (error) {
        errorCount++;
        // Ignorar erros individuais de mensagem
      }

      i++;
    }
  } catch (error) {
    throw new AppError("ERR_NOT_MESSAGE_TO_IMPORT", 403);
  }

  return "whatsapps";
};

export default ImportWhatsAppMessageService;
