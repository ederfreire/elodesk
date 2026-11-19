import { FlowBuilderModel } from "../../models/FlowBuilder";
import { getBodyMessage } from "../WbotServices/wbotMessageListener";
import { ActionsWebhookService } from "./ActionsWebhookService";
import Ticket from "../../models/Ticket";
import { proto, WASocket } from "@whiskeysockets/baileys";
import Whatsapp from "../../models/Whatsapp";
import { Session } from "../../libs/wbot";
import Contact from "../../models/Contact";
import { IConnections, INodes } from "./DispatchWebHookService";

// ✅ Lock para evitar execuções paralelas do mesmo ticket
const flowExecutionLocks = new Map<number, Promise<any>>();

const flowBuilderQueue = async (
  ticket: Ticket,
  msg: proto.IWebMessageInfo,
  wbot: Session,
  whatsapp: Whatsapp,
  companyId: number,
  contact: Contact,
  isFirstMsg: Ticket
) => {
  const body = getBodyMessage(msg);

  // ✅ CORRIGIDO: Se o ticket está "open" (aceito pelo atendente), parar o fluxo
  if (ticket.status === "open") {
    return;
  }

  // ✅ CRÍTICO: Verificar se já existe uma execução em andamento para este ticket
  const existingLock = flowExecutionLocks.get(ticket.id);
  if (existingLock) {
    try {
      await existingLock;
    } catch (err) {
      // Ignorar erros da execução anterior
    }
    // Recarregar ticket para verificar se ainda precisa continuar
    await ticket.reload();
    // Se o fluxo foi finalizado ou ticket foi aceito, não continuar
    if (ticket.status === "open" || !ticket.flowStopped || !ticket.lastFlowId) {
      return;
    }
  }

  // Verificar se existe fluxo interrompido válido
  if (!ticket.flowStopped || !ticket.lastFlowId) {
    return;
  }

  // ✅ Recarregar ticket para ter estado atualizado antes de verificar execução
  await ticket.reload();
  
  // ✅ Verificar se o fluxo está realmente esperando resposta
  // Se não há lastFlowId ou flowStopped, não há fluxo para continuar
  // O lock acima já previne execuções paralelas, então aqui só verificamos se há fluxo válido
  if (!ticket.flowStopped || !ticket.lastFlowId) {
    return;
  }

  // ✅ Criar lock para esta execução
  const executionPromise = (async () => {
    try {
      const flow = await FlowBuilderModel.findOne({
        where: {
          id: ticket.flowStopped,
          company_id: companyId // Usar company_id conforme o modelo
        }
      });

      if (!flow) {
        return;
      }

      const mountDataContact = {
        number: contact.number,
        name: contact.name,
        email: contact.email
      };

      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];

      const result = await ActionsWebhookService(
        whatsapp.id,
        parseInt(ticket.flowStopped),
        ticket.companyId,
        nodes,
        connections,
        ticket.lastFlowId,
        null,
        "",
        "",
        body,
        ticket.id,
        mountDataContact
      );
      
      if (result === "already_running") {
      } else {
      }
    } catch (error) {
      console.error("[FLOW QUEUE] Erro ao executar fluxo interrompido:", error);
      throw error;
    }
  })();

  // Armazenar lock
  flowExecutionLocks.set(ticket.id, executionPromise);

  try {
    await executionPromise;
  } finally {
    // Remover lock após conclusão
    flowExecutionLocks.delete(ticket.id);
  }
};

export default flowBuilderQueue;