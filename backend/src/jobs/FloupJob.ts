import FloupService from "../plugins/floup/service";
import FloupSchedule from "../models/FloupSchedule";
import Floup from "../models/Floup";
import FloupStepEvent from "../models/FloupStepEvent";
import logger from "../utils/logger";
import { getIO } from "../libs/socket";
const CronJob = require("cron").CronJob;

/**
 * Job para processar agendamentos do Floup
 * Executa a cada minuto para verificar e executar passos agendados
 */
export const startFloupJob = () => {
  const floupJob = new CronJob(
    "* * * * *", // A cada minuto para respeitar agendamentos curtos entre etapas
    async () => {
      try {
        const now = new Date();
        const { Op } = require('sequelize');
        
        // Buscar agendamentos pendentes que devem ser executados agora
        const schedulesToExecute = await FloupSchedule.findAll({
          where: {
            status: 'PENDING',
            nextRunAt: {
              [Op.lte]: now
            }
          },
          include: [
            {
              model: Floup,
              as: 'floup',
              attributes: ['id', 'name', 'steps', 'companyId']
            }
          ],
          order: [['nextRunAt', 'ASC']],
          limit: 50 // Processar até 50 por vez para não sobrecarregar
        });

        if (schedulesToExecute.length === 0) {
          return; // Nenhum agendamento para processar
        }

        logger.info(`[FLOUP] Job → Processando ${schedulesToExecute.length} agendamentos`);

        for (const schedule of schedulesToExecute) {
          try {
            // Verificar novamente se o schedule ainda está PENDING (pode ter sido cancelado entre a busca e o processamento)
            const scheduleAtualizado = await FloupSchedule.findByPk(schedule.id, {
              attributes: ['id', 'status', 'currentStepIndex', 'ticketId', 'contactId', 'floupId']
            });
            
            if (!scheduleAtualizado || scheduleAtualizado.status !== 'PENDING') {
              const statusMsg = scheduleAtualizado?.status || 'nao encontrado';
              logger.info(`[FLOUP] Job → Schedule ${schedule.id} nao esta mais PENDING (status: ${statusMsg}), pulando`);
              continue;
            }

            const floup = schedule.floup;
            if (!floup || !floup.steps || floup.steps.length === 0) {
              logger.warn(`[FLOUP] Job → Floup ${schedule.floupId} sem passos, cancelando schedule ${schedule.id}`);
              await schedule.update({ status: 'CANCELLED' });
              continue;
            }

            const stepIndex = schedule.currentStepIndex || 0;
            const ticketId = schedule.ticketId;
            const contactId = schedule.contactId;

            if (!ticketId && !contactId) {
              logger.warn(`[FLOUP] Job → Schedule ${schedule.id} sem ticketId nem contactId, cancelando`);
              await schedule.update({ status: 'CANCELLED' });
              continue;
            }

            // Se não tem ticketId mas tem contactId, buscar o ticket mais recente ABERTO do contato
            let finalTicketId = ticketId;
            if (!finalTicketId && contactId) {
              const Ticket = (await import('../models/Ticket')).default;
              // Priorizar tickets abertos ou pendentes
              let lastTicket = await Ticket.findOne({
                where: { contactId, companyId: floup.companyId, status: 'open' },
                order: [['updatedAt', 'DESC']]
              });
              if (!lastTicket) {
                lastTicket = await Ticket.findOne({
                  where: { contactId, companyId: floup.companyId, status: 'pending' },
                  order: [['updatedAt', 'DESC']]
                });
              }
              if (!lastTicket) {
                // Fallback: qualquer ticket
                lastTicket = await Ticket.findOne({
                  where: { contactId, companyId: floup.companyId },
                  order: [['updatedAt', 'DESC']]
                });
              }
              if (lastTicket) {
                finalTicketId = lastTicket.id;
              } else {
                logger.warn(`[FLOUP] Job → Contato ${contactId} sem tickets, cancelando schedule ${schedule.id}`);
                await schedule.update({ status: 'CANCELLED' });
                continue;
              }
            }

            logger.info(`[FLOUP] Job → Executando passo ${stepIndex + 1}/${floup.steps.length} do floup ${floup.id} para ticket ${finalTicketId}`);

            // Executar o passo
            const result: any = await FloupService.executarPasso(floup.id, finalTicketId, stepIndex);
            const executed = result === true || result?.sent === true;
            const isPauseOrStop = result?.paused === true || result?.stopped === true;
            const errMsg = result?.reason || result?.error || 'executarPasso retornou false';

            if (!executed && isPauseOrStop) {
              // Pausa/parada: não é erro — apenas pula esta execução, schedule fica como está (será re-tentado)
              logger.info(`[FLOUP] Job → Schedule ${schedule.id} ${result?.paused ? 'pausado' : 'parado'} por condição, sem registrar erro`);
              continue;
            }

            if (!executed) {
              logger.warn(`[FLOUP] Job → Falha ao executar passo ${stepIndex + 1} do floup ${floup.id}, marcando como erro no schedule ${schedule.id}`);
              await schedule.update({ status: 'ERROR' });
              // Persist ERROR event so the dashboard/timeline reflects the failure
              try {
                const failedStep = floup.steps[stepIndex] || {};
                const stepEvent = await FloupStepEvent.create({
                  companyId: floup.companyId,
                  floupId: floup.id,
                  scheduleId: schedule.id,
                  contactId: contactId,
                  ticketId: finalTicketId,
                  stepIndex,
                  stepOrder: failedStep.order || (stepIndex + 1),
                  stepData: failedStep,
                  status: 'ERROR',
                  errorMessage: errMsg,
                  executedAt: new Date()
                } as any);
                try {
                  const io = getIO();
                  io.of(String(floup.companyId)).emit(
                    `company-${floup.companyId}-floup-step-event`,
                    {
                      action: 'step-event',
                      event: {
                        id: (stepEvent as any).id,
                        floupId: floup.id,
                        scheduleId: schedule.id,
                        contactId: contactId,
                        ticketId: finalTicketId,
                        stepIndex,
                        stepOrder: failedStep.order || (stepIndex + 1),
                        stepData: failedStep,
                        status: 'ERROR',
                        errorMessage: errMsg,
                        executedAt: (stepEvent as any).executedAt || new Date().toISOString()
                      }
                    }
                  );
                } catch (socketErr) {
                  logger.error(`[FLOUP] Job → Erro ao emitir floup-step-event (ERROR):`, socketErr);
                }
              } catch (evtErr) {
                logger.error(`[FLOUP] Job → Erro ao registrar FloupStepEvent (ERROR):`, evtErr);
              }
              continue;
            }

            // Verificar novamente se o schedule ainda está PENDING antes de atualizar (pode ter sido cancelado durante a execução)
            const scheduleAntesUpdate = await FloupSchedule.findByPk(schedule.id, {
              attributes: ['id', 'status']
            });
            
            if (!scheduleAntesUpdate || scheduleAntesUpdate.status !== 'PENDING') {
              logger.info(`[FLOUP] Job → Schedule ${schedule.id} foi cancelado durante a execucao, nao atualizando`);
              continue;
            }

            // Verificar se há próximo passo
            const nextStepIndex = stepIndex + 1;
            if (nextStepIndex >= floup.steps.length) {
              // Último passo executado, marcar como concluído
              logger.info(`[FLOUP] Job → Floup ${floup.id} concluido para schedule ${schedule.id}`);
              await schedule.update({ status: 'COMPLETED' });

              // Persist COMPLETED event for the just-executed step
              try {
                const executedStepInfo = floup.steps[stepIndex] || {};
                const stepEvent = await FloupStepEvent.create({
                  companyId: floup.companyId,
                  floupId: floup.id,
                  scheduleId: schedule.id,
                  contactId: contactId,
                  ticketId: finalTicketId,
                  stepIndex,
                  stepOrder: executedStepInfo.order || (stepIndex + 1),
                  stepData: executedStepInfo,
                  status: 'COMPLETED',
                  executedAt: new Date()
                } as any);
                try {
                  const io = getIO();
                  io.of(String(floup.companyId)).emit(
                    `company-${floup.companyId}-floup-step-event`,
                    {
                      action: 'step-event',
                      event: {
                        id: (stepEvent as any).id,
                        floupId: floup.id,
                        scheduleId: schedule.id,
                        contactId: contactId,
                        ticketId: finalTicketId,
                        stepIndex,
                        stepOrder: executedStepInfo.order || (stepIndex + 1),
                        stepData: executedStepInfo,
                        status: 'COMPLETED',
                        executedAt: (stepEvent as any).executedAt || new Date().toISOString(),
                        completed: true
                      }
                    }
                  );
                } catch (socketErr) {
                  logger.error(`[FLOUP] Job → Erro ao emitir floup-step-event (final):`, socketErr);
                }
              } catch (evtErr) {
                logger.error(`[FLOUP] Job → Erro ao registrar FloupStepEvent (final):`, evtErr);
              }

              // Emitir evento Socket.IO para atualizar o frontend (Floup concluído)
              try {
                const io = getIO();
                io.of(String(floup.companyId)).emit(`company-${floup.companyId}-floup-step-executed`, {
                  action: 'step-executed',
                  floupId: floup.id,
                  contactId: contactId,
                  scheduleId: schedule.id,
                  stepIndex: stepIndex,
                  nextStepIndex: null, // Não há próximo passo
                  executedAt: new Date().toISOString(),
                  completed: true
                });
                logger.info(`[FLOUP] Job → Evento Socket.IO emitido (Floup concluído): floupId=${floup.id}, contactId=${contactId}, stepIndex=${stepIndex}`);
              } catch (socketError) {
                logger.error(`[FLOUP] Job → Erro ao emitir evento Socket.IO:`, socketError);
              }
            } else {
              // Calcular próximo horário de execução baseado no próximo passo
              const nextStep = floup.steps[nextStepIndex];

              // Usar o horário atual de execução como base para calcular o próximo
              const executionTime = new Date();
              const tz = await FloupService.resolveCompanyTimezone(floup.companyId);
              let nextRunAt = FloupService.calcularProximoHorario(nextStep, executionTime, tz);

              // Garantir mínimo de 1 minuto: se o cálculo retornou um horário no passado
              // ou imediato, agendar para daqui a 1 minuto para evitar disparo duplicado
              const minNext = new Date(executionTime.getTime() + 60 * 1000);
              if (!nextRunAt || nextRunAt.getTime() < minNext.getTime()) {
                logger.info(
                  `[FLOUP] Job → nextRunAt ajustado para mínimo 1 min ` +
                  `(timeValue=${nextStep?.timeValue}, timeUnit=${nextStep?.timeUnit})`
                );
                nextRunAt = minNext;
              }

              // Atualizar schedule para o próximo passo (usando update com where para garantir atomicidade)
              const [rowsUpdated] = await FloupSchedule.update({
                currentStepIndex: nextStepIndex,
                nextRunAt,
                stepOrder: nextStep.order || (nextStepIndex + 1),
                stepData: nextStep
              }, {
                where: {
                  id: schedule.id,
                  status: 'PENDING' // Só atualizar se ainda estiver PENDING
                }
              });

              if (rowsUpdated === 0) {
                logger.warn(`[FLOUP] Job → Schedule ${schedule.id} nao foi atualizado (provavelmente foi cancelado)`);
              } else {
                logger.info(`[FLOUP] Job → Proximo passo ${nextStepIndex + 1} agendado para ${nextRunAt.toISOString()}`);

                // Persist COMPLETED event for the just-executed step
                try {
                  const executedStepInfo = floup.steps[stepIndex] || {};
                  const stepEvent = await FloupStepEvent.create({
                    companyId: floup.companyId,
                    floupId: floup.id,
                    scheduleId: schedule.id,
                    contactId: contactId,
                    ticketId: finalTicketId,
                    stepIndex,
                    stepOrder: executedStepInfo.order || (stepIndex + 1),
                    stepData: executedStepInfo,
                    status: 'COMPLETED',
                    executedAt: new Date()
                  } as any);
                  try {
                    const io = getIO();
                    io.of(String(floup.companyId)).emit(
                      `company-${floup.companyId}-floup-step-event`,
                      {
                        action: 'step-event',
                        event: {
                          id: (stepEvent as any).id,
                          floupId: floup.id,
                          scheduleId: schedule.id,
                          contactId: contactId,
                          ticketId: finalTicketId,
                          stepIndex,
                          stepOrder: executedStepInfo.order || (stepIndex + 1),
                          stepData: executedStepInfo,
                          status: 'COMPLETED',
                          executedAt: (stepEvent as any).executedAt || new Date().toISOString(),
                          nextStepIndex
                        }
                      }
                    );
                  } catch (socketErr) {
                    logger.error(`[FLOUP] Job → Erro ao emitir floup-step-event:`, socketErr);
                  }
                } catch (evtErr) {
                  logger.error(`[FLOUP] Job → Erro ao registrar FloupStepEvent:`, evtErr);
                }

                // Emitir eventos Socket.IO para atualizar o frontend
                try {
                  const io = getIO();
                  io.of(String(floup.companyId)).emit(`company-${floup.companyId}-floup-step-executed`, {
                    action: 'step-executed',
                    floupId: floup.id,
                    contactId: contactId,
                    scheduleId: schedule.id,
                    stepIndex: stepIndex,
                    nextStepIndex: nextStepIndex,
                    executedAt: new Date().toISOString()
                  });
                  io.of(String(floup.companyId)).emit(`company-${floup.companyId}-floup-step-changed`, {
                    action: 'step-changed',
                    floupId: floup.id,
                    contactId: contactId,
                    scheduleId: schedule.id,
                    previousStepIndex: stepIndex,
                    currentStepIndex: nextStepIndex,
                    nextRunAt: nextRunAt.toISOString(),
                    changedAt: new Date().toISOString()
                  });
                  logger.info(`[FLOUP] Job → Eventos Socket.IO emitidos para atualizar frontend: floupId=${floup.id}, contactId=${contactId}, previousStepIndex=${stepIndex}, currentStepIndex=${nextStepIndex}`);
                } catch (socketError) {
                  logger.error(`[FLOUP] Job → Erro ao emitir evento Socket.IO:`, socketError);
                }
              }
            }
          } catch (error) {
            logger.error(`[FLOUP] Job → Erro ao processar schedule ${schedule.id}:`, error);
            // Marcar como erro mas não cancelar, pode ser temporário
            try {
              await schedule.update({ status: 'ERROR' });
            } catch (updateError) {
              logger.error(`[FLOUP] Job → Erro ao atualizar status do schedule ${schedule.id}:`, updateError);
            }
          }
        }

        logger.info(`[FLOUP] Job ✓ Processamento concluido`);
      } catch (error) {
        logger.error(`[FLOUP] Job → Erro geral no processamento:`, error);
      }
    },
    null, // onComplete
    true, // start immediately
    "America/Sao_Paulo" // timezone
  );

  logger.info(`[FLOUP] Job inicializado - executando a cada minuto`);

  return floupJob;
};

/**
 * Inicializa o job do Floup
 */
export const initializeFloupJob = () => {
  const floupJob = startFloupJob();

  // Graceful shutdown
  const shutdown = () => {
    logger.info('[FLOUP] Job → Parando job do Floup...');
    floupJob.stop();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { floupJob };
};
