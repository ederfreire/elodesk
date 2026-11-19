import { getIO } from '../../libs/socket';
import Floup from '../../models/Floup';
import FloupSchedule from '../../models/FloupSchedule';
import FloupStepEvent from '../../models/FloupStepEvent';
import Contact from '../../models/Contact';
import logger from '../../utils/logger';
import { QueryTypes, fn, col, literal } from 'sequelize';

// Helper para executar queries do Floup com fallback se colunas não existirem
const safeFloupQuery = async <T = any>(
  queryFn: () => any,
  fallbackQueryFn?: () => any
): Promise<T> => {
  try {
    const result = await queryFn();
    return result as T;
  } catch (error: any) {
    if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
      logger.warn(`[FLOUP] Colunas condition/conditionValue não existem. Usando fallback.`);
      if (fallbackQueryFn) {
        const result = await fallbackQueryFn();
        return result as T;
      }
      // Se não houver fallback, tentar novamente excluindo as colunas problemáticas
      throw error;
    }
    throw error;
  }
};

export default class FloupService {
  static async listarFloups(companyId: number) {
    logger.info(`[FLOUP] service.listarFloups → companyId=${companyId}`);
    try {
      // Tentar buscar com todas as colunas primeiro
      const floups = await Floup.findAll({ 
        where: { companyId }, 
        order: [['name', 'ASC']],
        attributes: {
          exclude: [] // Tentar buscar todas as colunas
        }
      });
      logger.info(`[FLOUP] service.listarFloups ✓ count=${floups.length}`);
      return floups;
    } catch (error: any) {
      // Se der erro por colunas não existentes, buscar sem as colunas condition e conditionValue
      if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
        logger.warn(`[FLOUP] Colunas condition/conditionValue não existem ainda. Buscando sem elas.`);
        const floups = await Floup.findAll({ 
          where: { companyId }, 
          order: [['name', 'ASC']],
          attributes: {
            exclude: ['condition', 'conditionValue']
          }
        });
        logger.info(`[FLOUP] service.listarFloups ✓ count=${floups.length} (sem condition/conditionValue)`);
        return floups;
      }
      throw error;
    }
  }

  // Buscar dados de um Floup específico agrupados por etapa (para Kanban de etapas)
  static async obterDadosDashboardPorFloup(floupId: number, companyId: number, filters?: { channel?: string, search?: string }) {
    logger.info(`[FLOUP] service.obterDadosDashboardPorFloup → floupId=${floupId}, companyId=${companyId}, filters=${JSON.stringify(filters)}`);
    try {
      const Ticket = (await import('../../models/Ticket')).default;
      
      // Buscar o Floup
      let floup;
      try {
        floup = await Floup.findOne({
          where: { id: floupId, companyId }
        });
      } catch (error: any) {
        if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
          logger.warn(`[FLOUP] Colunas condition/conditionValue não existem. Buscando sem elas.`);
          floup = await Floup.findOne({
            where: { id: floupId, companyId },
            attributes: {
              exclude: ['condition', 'conditionValue']
            }
          });
        } else {
          throw error;
        }
      }
      
      if (!floup) {
        logger.warn(`[FLOUP] obterDadosDashboardPorFloup → Floup ${floupId} não encontrado`);
        return null;
      }
      
      const steps = floup.steps || [];

      // Buscar TODOS os schedules deste Floup (para métricas)
      const { Op } = require('sequelize');
      const allSchedules = await FloupSchedule.findAll({
        where: { floupId, companyId },
        attributes: ['id', 'status', 'currentStepIndex', 'nextRunAt', 'ticketId', 'contactId', 'updatedAt'],
        include: [
          {
            model: Contact,
            as: 'contact',
            attributes: ['id', 'name', 'number', 'profilePicUrl'],
            required: true
          },
          {
            model: Ticket,
            as: 'ticket',
            attributes: ['id', 'uuid', 'channel', 'status'],
            required: false
          }
        ],
        order: [['nextRunAt', 'ASC']]
      });

      // Source executed-step counts from FloupStepEvent (per contact)
      const executedByContact = new Map<number, number>();
      try {
        const eventRows: any[] = await FloupStepEvent.findAll({
          where: { companyId, floupId, status: 'COMPLETED' },
          attributes: [
            'contactId',
            [fn('COUNT', literal('DISTINCT "stepIndex"')), 'count']
          ],
          group: ['contactId'],
          raw: true
        });
        for (const row of eventRows) {
          if (row.contactId == null) continue;
          executedByContact.set(Number(row.contactId), Number(row.count) || 0);
        }
      } catch (evtErr) {
        logger.warn(`[FLOUP] obterDadosDashboardPorFloup → Falha ao agregar FloupStepEvents:`, evtErr);
      }

      // Calcular métricas por contato para evitar percentuais inflados por históricos antigos
      const contactProgressMap = new Map<number, { completedSteps: number; status: string; updatedAt: number }>();

      for (const schedule of allSchedules) {
        if (!schedule.contactId) continue;

        const scheduleUpdatedAt = new Date(
          schedule.updatedAt || schedule.nextRunAt || 0
        ).getTime();
        const fallbackCompleted = schedule.status === 'COMPLETED'
          ? steps.length
          : Math.max(schedule.currentStepIndex || 0, 0);
        const eventCompleted = executedByContact.get(Number(schedule.contactId)) || 0;
        const completedSteps = Math.min(
          Math.max(eventCompleted, fallbackCompleted),
          steps.length
        );

        const existingProgress = contactProgressMap.get(schedule.contactId);
        if (!existingProgress || scheduleUpdatedAt >= existingProgress.updatedAt) {
          contactProgressMap.set(schedule.contactId, {
            completedSteps,
            status: schedule.status,
            updatedAt: scheduleUpdatedAt
          });
        }
      }

      const totalHistorical = contactProgressMap.size;
      const completedCount = Array.from(contactProgressMap.values()).filter(item => item.status === 'COMPLETED').length;
      const respondedCount = Array.from(contactProgressMap.values()).filter(item => item.status === 'CANCELLED').length;
      const completionProgressTotal = totalHistorical * Math.max(steps.length, 1);
      const completionProgressCount = Array.from(contactProgressMap.values()).reduce(
        (sum, item) => sum + item.completedSteps,
        0
      );
      const completionRate = completionProgressTotal > 0
        ? Math.round((completionProgressCount / completionProgressTotal) * 100)
        : 0;
      const responseRate = totalHistorical > 0 ? Math.round((respondedCount / totalHistorical) * 100) : 0;

      // Manter visíveis no kanban os contatos aguardando, pausados e com erro,
      // para não "sumirem" da etapa quando uma execução falha.
      const activeSchedules = allSchedules.filter(s => (
        s.status === 'PENDING' || s.status === 'PAUSED' || s.status === 'ERROR'
      ));
      
      // Agrupar contatos por etapa (currentStepIndex)
      const stepsMap = new Map();
      
      // Inicializar todas as etapas
      steps.forEach((step, index) => {
        stepsMap.set(index, {
          stepIndex: index,
          stepOrder: step.order || (index + 1),
          stepMessage: step.message || `Etapa ${index + 1}`,
          contacts: []
        });
      });
      
      // Processar cada schedule e adicionar aos contatos da etapa correspondente
      for (const schedule of activeSchedules) {
        if (!schedule.contact) continue;
        
        const stepIndex = schedule.currentStepIndex || 0;
        
        // Buscar canal do ticket
        let channel = 'N/A';
        if (schedule.ticket) {
          channel = schedule.ticket.channel || 'N/A';
        } else if (schedule.ticketId) {
          try {
            const ticket = await Ticket.findByPk(schedule.ticketId, { attributes: ['channel'] });
            if (ticket) channel = ticket.channel || 'N/A';
          } catch (e) {
            // Ignorar erro
          }
        }
        
        // Aplicar filtros
        // O escape `channel !== 'N/A'` existia aqui e anulava o filtro: todo
        // agendamento cujo ticket foi apagado (ou que nunca teve ticket) passava
        // por qualquer canal escolhido, e o usuario via a lista inteira de novo.
        // Sem canal identificado, o registro nao pertence a canal nenhum — logo
        // nao deve aparecer quando se filtra por um canal especifico.
        if (filters?.channel && channel !== filters.channel) {
          continue;
        }
        if (filters?.search) {
          const searchLower = filters.search.toLowerCase();
          const contactName = (schedule.contact.name || '').toLowerCase();
          const contactNumber = (schedule.contact.number || '').toLowerCase();
          if (!contactName.includes(searchLower) && !contactNumber.includes(searchLower)) {
            continue;
          }
        }
        
        // Verificar erros recentes
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
        const hasRecentError = schedule.status === 'ERROR' && new Date(schedule.updatedAt) >= twentyFourHoursAgo;
        
        const contactData = {
          contactId: schedule.contact.id,
          contactName: schedule.contact.name || 'Sem nome',
          contactNumber: schedule.contact.number || '',
          contactProfilePicUrl: schedule.contact.profilePicUrl || null,
          scheduleId: schedule.id,
          ticketId: schedule.ticketId,
          ticketUuid: schedule.ticket?.uuid || null,
          ticketStatus: schedule.ticket?.status || null,
          nextRunAt: schedule.nextRunAt,
          channel,
          hasRecentError,
          status: schedule.status === 'ERROR'
            ? 'ERROR'
            : (schedule.status === 'PAUSED' ? 'PAUSED' : 'PENDING'),
          currentStepIndex: schedule.currentStepIndex || 0
        };
        
        // Adicionar à etapa correspondente
        if (!stepsMap.has(stepIndex)) {
          stepsMap.set(stepIndex, {
            stepIndex,
            stepOrder: stepIndex + 1,
            stepMessage: `Etapa ${stepIndex + 1}`,
            contacts: []
          });
        }
        
        stepsMap.get(stepIndex).contacts.push(contactData);
      }
      
      // Converter para array ordenado por stepIndex
      const stepsData = Array.from(stepsMap.values())
        .sort((a, b) => a.stepIndex - b.stepIndex)
        .map(stepData => ({
          stepIndex: stepData.stepIndex,
          stepOrder: stepData.stepOrder,
          stepMessage: stepData.stepMessage,
          contactsCount: stepData.contacts.length,
          contacts: stepData.contacts
        }));

      const activeTotal = stepsData.reduce((sum, step) => sum + step.contactsCount, 0);
      const pausedCount = stepsData.reduce(
        (sum, step) => sum + step.contacts.filter(contact => contact.status === 'PAUSED').length,
        0
      );
      const errorCount = stepsData.reduce(
        (sum, step) => sum + step.contacts.filter(contact => contact.status === 'ERROR').length,
        0
      );
      const activeRunningCount = Math.max(activeTotal - pausedCount - errorCount, 0);
      
      return {
        floupId: floup.id,
        floupName: floup.name,
        floupDescription: floup.description,
        totalSteps: steps.length,
        steps: stepsData,
        totalContacts: activeTotal,
        activeMetrics: {
          total: activeTotal,
          runningCount: activeRunningCount,
          pausedCount,
          errorCount
        },
        historicalMetrics: {
          totalHistorical,
          completedCount,
          respondedCount,
          completionProgressCount,
          completionProgressTotal,
          completionRate,
          responseRate
        }
      };
    } catch (error: any) {
      logger.error(`[FLOUP] obterDadosDashboardPorFloup → Erro:`, error);
      if (error.code === 'ECONNRESET' || error.name === 'SequelizeDatabaseError') {
        logger.warn(`[FLOUP] obterDadosDashboardPorFloup → Erro de conexão com banco`);
        return null;
      }
      throw error;
    }
  }

  // Buscar dados consolidados para o Dashboard Kanban - Agora retorna CONTATOS que estão nos Floups
  static async obterDadosDashboard(filters?: { companyId?: number, channel?: string, status?: string, search?: string }) {
    logger.info(`[FLOUP] service.obterDadosDashboard → filters=${JSON.stringify(filters)}`);
    try {
      const { Op } = require('sequelize');
      const Ticket = (await import('../../models/Ticket')).default;
      
      // companyId é obrigatório
      if (!filters?.companyId) {
        throw new Error('companyId é obrigatório para obter dados do dashboard');
      }
      
      // Buscar todos os schedules ativos (PENDING) com seus contatos e Floups
      const { Op: Op2 } = require('sequelize');
      const whereSchedule: any = {
        companyId: filters.companyId,
        status: { [Op2.in]: ['PENDING', 'PAUSED'] }
      };
      
      // Buscar schedules ativos com contatos e Floups
      const activeSchedules = await FloupSchedule.findAll({
        where: whereSchedule,
        include: [
          {
            model: Contact,
            as: 'contact',
            attributes: ['id', 'name', 'number', 'profilePicUrl'],
            required: true // Apenas schedules com contato
          },
          {
            model: Floup,
            as: 'floup',
            attributes: ['id', 'name', 'description', 'steps', 'isActive'],
            required: true
          },
          {
            model: Ticket,
            as: 'ticket',
            attributes: ['id', 'channel', 'status', 'uuid'],
            required: false
          }
        ],
        order: [['nextRunAt', 'ASC']]
      });

      // Pre-fetch executed step counts per (floupId, contactId) so that
      // executedSteps is sourced from real events instead of currentStepIndex.
      const executedEventsCount = new Map<string, number>();
      try {
        const eventRows: any[] = await FloupStepEvent.findAll({
          where: { companyId: filters.companyId, status: 'COMPLETED' },
          attributes: [
            'floupId',
            'contactId',
            [fn('COUNT', literal('DISTINCT "stepIndex"')), 'count']
          ],
          group: ['floupId', 'contactId'],
          raw: true
        });
        for (const row of eventRows) {
          if (row.floupId == null || row.contactId == null) continue;
          executedEventsCount.set(
            `${row.floupId}:${row.contactId}`,
            Number(row.count) || 0
          );
        }
      } catch (evtErr) {
        logger.warn(`[FLOUP] obterDadosDashboard → Falha ao agregar FloupStepEvents (usando fallback):`, evtErr);
      }

      // Agrupar por contato (um contato pode estar em múltiplos Floups)
      const contactsMap = new Map();
      
      for (const schedule of activeSchedules) {
        if (!schedule.contact || !schedule.floup) continue;
        
        const contactId = schedule.contact.id;
        const floupId = schedule.floup.id;
        
        // Buscar canal do ticket
        let channel = 'N/A';
        if (schedule.ticket) {
          channel = schedule.ticket.channel || 'N/A';
        } else if (schedule.ticketId) {
          try {
            const ticket = await Ticket.findByPk(schedule.ticketId, { attributes: ['channel'] });
            if (ticket) channel = ticket.channel || 'N/A';
          } catch (e) {
            // Ignorar erro
          }
        }
        
        // Verificar erros recentes para este schedule
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
        const hasRecentError = schedule.status === 'ERROR' && new Date(schedule.updatedAt) >= twentyFourHoursAgo;
        
        // Determinar status do contato no Floup
        let status = 'running';
        if (hasRecentError) {
          status = 'error';
        } else if (schedule.status === 'PAUSED') {
          status = 'paused';
        } else if (!schedule.floup.isActive) {
          status = 'paused';
        } else {
          status = 'running';
        }
        
        // Aplicar filtros
        // O escape `channel !== 'N/A'` existia aqui e anulava o filtro: todo
        // agendamento cujo ticket foi apagado (ou que nunca teve ticket) passava
        // por qualquer canal escolhido, e o usuario via a lista inteira de novo.
        // Sem canal identificado, o registro nao pertence a canal nenhum — logo
        // nao deve aparecer quando se filtra por um canal especifico.
        if (filters?.channel && channel !== filters.channel) {
          continue;
        }
        if (filters?.status && status !== filters.status) {
          continue;
        }
        if (filters?.search) {
          const searchLower = filters.search.toLowerCase();
          const contactName = (schedule.contact.name || '').toLowerCase();
          const contactNumber = (schedule.contact.number || '').toLowerCase();
          const floupName = (schedule.floup.name || '').toLowerCase();
          if (!contactName.includes(searchLower) && !contactNumber.includes(searchLower) && !floupName.includes(searchLower)) {
            continue;
          }
        }
        
        // Criar ou atualizar entrada do contato
        if (!contactsMap.has(contactId)) {
          contactsMap.set(contactId, {
            contactId: schedule.contact.id,
            contactName: schedule.contact.name || 'Sem nome',
            contactNumber: schedule.contact.number || '',
            contactProfilePicUrl: schedule.contact.profilePicUrl || null,
            floups: []
          });
        }
        
        const contactData = contactsMap.get(contactId);
        const floupTotalSteps = (schedule.floup.steps || []).length;
        const rawCurrentIndex = Math.max(schedule.currentStepIndex || 0, 0);
        // Prefer real executed step events; fall back to currentStepIndex
        // for legacy data (rows created before FloupStepEvent existed).
        const eventsCount = executedEventsCount.get(`${floupId}:${contactId}`) || 0;
        const fallbackExecuted = schedule.status === 'COMPLETED'
          ? floupTotalSteps
          : rawCurrentIndex;
        const floupExecutedSteps = floupTotalSteps > 0
          ? Math.min(Math.max(eventsCount, fallbackExecuted), floupTotalSteps)
          : 0;
        const floupProgressPercent = floupTotalSteps > 0
          ? Math.round((floupExecutedSteps / floupTotalSteps) * 100)
          : 0;
        contactData.floups.push({
          floupId: schedule.floup.id,
          floupName: schedule.floup.name,
          floupDescription: schedule.floup.description,
          currentStepIndex: schedule.currentStepIndex,
          totalSteps: floupTotalSteps,
          executedSteps: floupExecutedSteps,
          progressPercent: floupProgressPercent,
          nextRunAt: schedule.nextRunAt,
          channel,
          status,
          scheduleId: schedule.id,
          hasRecentError
        });
      }
      
      // Converter map para array e processar
      const contactsData = Array.from(contactsMap.values()).map(contactData => {
        // Determinar status geral do contato (se tem erro em algum Floup, é erro)
        let overallStatus = 'running';
        if (contactData.floups.some((f: any) => f.status === 'error')) {
          overallStatus = 'error';
        } else if (contactData.floups.some((f: any) => f.status === 'paused')) {
          overallStatus = 'paused';
        }
        
        // Próxima execução mais próxima
        const nextExecutions = contactData.floups
          .map((f: any) => new Date(f.nextRunAt).getTime())
          .filter((t: number) => !isNaN(t));
        const nextExecution = nextExecutions.length > 0 
          ? new Date(Math.min(...nextExecutions))
          : null;
        
        return {
          contactId: contactData.contactId,
          contactName: contactData.contactName,
          contactNumber: contactData.contactNumber,
          contactProfilePicUrl: contactData.contactProfilePicUrl,
          floups: contactData.floups,
          floupsCount: contactData.floups.length,
          status: overallStatus,
          nextExecution,
          channels: [...new Set(contactData.floups.map((f: any) => f.channel).filter((c: string) => c !== 'N/A'))],
          executedSteps: contactData.floups.reduce(
            (sum: number, f: any) => sum + (f.executedSteps || 0),
            0
          ),
          totalSteps: contactData.floups.reduce(
            (sum: number, f: any) => sum + (f.totalSteps || 0),
            0
          ),
          progressPercent: (() => {
            const total = contactData.floups.reduce(
              (sum: number, f: any) => sum + (f.totalSteps || 0),
              0
            );
            const executed = contactData.floups.reduce(
              (sum: number, f: any) => sum + (f.executedSteps || 0),
              0
            );
            return total > 0 ? Math.round((executed / total) * 100) : 0;
          })()
        };
      });
      
      logger.info(`[FLOUP] service.obterDadosDashboard ✓ count=${contactsData.length} contatos`);
      return contactsData;
    } catch (error: any) {
      logger.error(`[FLOUP] service.obterDadosDashboard → Erro:`, error);
      // Se for erro de conexão, retornar array vazio em vez de quebrar
      if (error.code === 'ECONNRESET' || error.name === 'SequelizeDatabaseError') {
        logger.warn(`[FLOUP] service.obterDadosDashboard → Erro de conexão com banco, retornando array vazio`);
        return [];
      }
      throw error;
    }
  }

  static async criarFloup(config: any) {
    logger.info(`[FLOUP] service.criarFloup → companyId=${config.companyId}, name=${config.name}`);
    
    // Log dos steps recebidos para debug
    if (config.steps && config.steps.length > 0) {
      logger.info(`[FLOUP] service.criarFloup → Steps recebidos: ${config.steps.length} passos`);
      config.steps.forEach((step: any, idx: number) => {
        logger.info(`[FLOUP] service.criarFloup → Passo ${idx + 1}: order=${step.order}, mediaUrl=${step.mediaUrl ? step.mediaUrl.substring(0, 100) + '...' : 'VAZIO'}, mediaType=${step.mediaType || 'N/A'}`);
      });
    }
    
    // Garantir que os steps sejam um array válido
    const stepsToSave = config.steps && Array.isArray(config.steps) ? config.steps : [];
    
    // Log completo do JSON antes de salvar
    logger.info(`[FLOUP] service.criarFloup → JSON completo dos steps a serem salvos: ${JSON.stringify(stepsToSave, null, 2)}`);
    
    // Tentar criar com todas as colunas primeiro
    let novoFloup;
    try {
      novoFloup = await Floup.create({
        companyId: config.companyId,
        name: config.name,
        description: config.description || '',
        isActive: config.isActive !== undefined ? config.isActive : true,
        steps: stepsToSave,
        stopConditions: config.stopConditions || [],
        pauseConditions: config.pauseConditions || [],
        condition: config.condition || 'queue',
        conditionValue: config.conditionValue || ''
      });
    } catch (error: any) {
      // Se der erro por colunas não existentes, criar usando SQL direto
      if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
        logger.warn(`[FLOUP] Colunas condition/conditionValue não existem. Criando usando SQL direto.`);
        const sequelize = Floup.sequelize;
        
        try {
          // Primeiro, verificar o nome exato da tabela
          const tableCheckResult: any = await sequelize.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND LOWER(table_name) = LOWER('Floups')
            LIMIT 1;
          `, { type: QueryTypes.SELECT });
          
          const actualTableName = tableCheckResult && tableCheckResult.length > 0 
            ? (tableCheckResult[0] as any).table_name 
            : 'Floups';
          
          logger.info(`[FLOUP] Usando nome da tabela: ${actualTableName}`);
          
          const stepsJson = JSON.stringify(stepsToSave);
          const stopConditionsJson = JSON.stringify(config.stopConditions || []);
          const pauseConditionsJson = JSON.stringify(config.pauseConditions || []);
          const now = new Date();
          
          const insertResult: any = await sequelize.query(`
            INSERT INTO "${actualTableName}" ("companyId", "name", "description", "isActive", "steps", "stopConditions", "pauseConditions", "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)
            RETURNING "id", "companyId", "name", "description", "isActive", "steps", "stopConditions", "pauseConditions", "templateType", "createdAt", "updatedAt";
          `, {
            bind: [
              config.companyId,
              config.name,
              config.description || '',
              config.isActive !== undefined ? config.isActive : true,
              stepsJson,
              stopConditionsJson,
              pauseConditionsJson,
              now,
              now
            ],
            type: QueryTypes.SELECT
          });
          
          logger.info(`[FLOUP] Resultado do INSERT:`, insertResult);
          
          if (insertResult && insertResult.length > 0 && (insertResult[0] as any).id) {
            const insertedId = (insertResult[0] as any).id;
            // ✅ CORRIGIDO: Buscar via SQL direto para evitar que Sequelize tente buscar colunas inexistentes
            const selectResult: any = await sequelize.query(`
              SELECT "id", "companyId", "name", "description", "isActive", "steps", "stopConditions", "pauseConditions", "templateType", "createdAt", "updatedAt"
              FROM "${actualTableName}"
              WHERE "id" = $1
            `, {
              bind: [insertedId],
              type: QueryTypes.SELECT
            });
            
            if (selectResult && selectResult.length > 0) {
              const row = selectResult[0];
              // Construir objeto Floup manualmente (sem usar o modelo para evitar busca de colunas inexistentes)
              novoFloup = {
                id: row.id,
                companyId: row.companyId,
                name: row.name,
                description: row.description || '',
                isActive: row.isActive,
                steps: row.steps || [],
                stopConditions: row.stopConditions || [],
                pauseConditions: row.pauseConditions || [],
                templateType: row.templateType || null,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                // Adicionar métodos necessários do Sequelize Model
                save: async () => novoFloup,
                update: async () => novoFloup,
                reload: async () => novoFloup,
                toJSON: () => ({
                  id: row.id,
                  companyId: row.companyId,
                  name: row.name,
                  description: row.description || '',
                  isActive: row.isActive,
                  steps: row.steps || [],
                  stopConditions: row.stopConditions || [],
                  pauseConditions: row.pauseConditions || [],
                  templateType: row.templateType || null,
                  createdAt: row.createdAt,
                  updatedAt: row.updatedAt
                })
              } as any;
              logger.info(`[FLOUP] Floup criado via SQL direto com sucesso. ID: ${novoFloup.id}`);
            } else {
              throw new Error(`Falha ao buscar Floup criado (ID: ${insertedId}) - nenhum resultado retornado`);
            }
          } else {
            logger.error(`[FLOUP] SQL direto não retornou resultados válidos:`, JSON.stringify(insertResult));
            throw new Error('Falha ao criar Floup via SQL direto - nenhum resultado retornado');
          }
        } catch (sqlError: any) {
          logger.error(`[FLOUP] Erro ao criar Floup via SQL direto:`, sqlError);
          logger.error(`[FLOUP] Stack trace:`, sqlError.stack);
          throw new Error(`Falha ao criar Floup via SQL direto: ${sqlError.message}`);
        }
      } else {
        throw error;
      }
    }

    // Recarregar o floup para garantir que os dados estão atualizados
    await novoFloup.reload();

    // Log dos steps salvos para verificar
    if (novoFloup.steps && novoFloup.steps.length > 0) {
      logger.info(`[FLOUP] service.criarFloup → Steps salvos: ${novoFloup.steps.length} passos`);
      novoFloup.steps.forEach((step: any, idx: number) => {
        logger.info(`[FLOUP] service.criarFloup → Passo ${idx + 1} salvo: order=${step.order}, mediaUrl=${step.mediaUrl ? step.mediaUrl.substring(0, 100) + '...' : 'VAZIO'}, mediaType=${step.mediaType || 'N/A'}`);
      });
    } else {
      logger.warn(`[FLOUP] service.criarFloup → Nenhum step encontrado após salvar!`);
    }

    // Mover arquivos de temp para a pasta do floup se houver
    try {
      const fs = require('fs');
      const path = require('path');
      const publicFolder = path.resolve(__dirname, '..', '..', '..', 'public');
      const tempFolder = path.join(publicFolder, `company${config.companyId}`, 'floup', 'temp');
      const floupFolder = path.join(publicFolder, `company${config.companyId}`, 'floup', String(novoFloup.id));
      
      if (fs.existsSync(tempFolder)) {
        // Criar pasta do floup se não existir
        if (!fs.existsSync(floupFolder)) {
          fs.mkdirSync(floupFolder, { recursive: true });
        }
        
        // Mover arquivos de temp para a pasta do floup
        const files = fs.readdirSync(tempFolder);
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
        const proxyPort = process.env.PROXY_PORT;
        const baseUrl = proxyPort ? `${backendUrl}:${proxyPort}` : backendUrl;
        
        // Atualizar URLs nos steps e mover arquivos
        const updatedSteps = stepsToSave.map((step: any) => {
          if (step.mediaUrl && step.mediaUrl.includes('/floup/temp/')) {
            // Extrair nome do arquivo da URL
            const fileName = step.mediaUrl.split('/').pop();
            const oldPath = path.join(tempFolder, fileName);
            const newPath = path.join(floupFolder, fileName);
            
            if (fs.existsSync(oldPath)) {
              // Mover arquivo
              fs.renameSync(oldPath, newPath);
              // Atualizar URL no step
              const newUrl = `${baseUrl}/public/company${config.companyId}/floup/${novoFloup.id}/${fileName}`;
              return { ...step, mediaUrl: newUrl };
            }
          }
          return step;
        });
        
        // Se houve atualizações, salvar novamente
        if (JSON.stringify(updatedSteps) !== JSON.stringify(stepsToSave)) {
          await novoFloup.update({ steps: updatedSteps });
          await novoFloup.reload();
        }
        
        // Remover pasta temp se estiver vazia
        try {
          const remainingFiles = fs.readdirSync(tempFolder);
          if (remainingFiles.length === 0) {
            fs.rmdirSync(tempFolder);
          }
        } catch {}
        
        logger.info(`[FLOUP] service.criarFloup → Arquivos movidos de temp para floup ${novoFloup.id}`);
      }
    } catch (err: any) {
      logger.warn(`[FLOUP] service.criarFloup → Erro ao mover arquivos: ${err.message}`);
    }
    
    try {
      const io = getIO();
      io.of(String(config.companyId)).emit(`company-${config.companyId}-floup`, { action: 'create', floup: novoFloup });
    } catch {}
    logger.info(`[FLOUP] service.criarFloup ✓ id=${novoFloup.id}`);
    return novoFloup;
  }

  static async duplicarFloup(id: number, companyId: number) {
    logger.info(`[FLOUP] service.duplicarFloup → id=${id}, companyId=${companyId}`);
    const original = await safeFloupQuery<Floup | null>(
      () => Floup.findByPk(id),
      () => Floup.findByPk(id, { attributes: { exclude: ['condition', 'conditionValue'] } })
    );
    if (!original || original.companyId !== companyId) return null;
    // Tentar criar com todas as colunas primeiro
    let floupDuplicado;
    try {
      floupDuplicado = await Floup.create({
        companyId,
        name: `${original.name} (Cópia)`,
        description: original.description,
        isActive: false,
        steps: original.steps,
        stopConditions: original.stopConditions || [],
        pauseConditions: original.pauseConditions || [],
        condition: (original as any).condition || 'queue',
        conditionValue: (original as any).conditionValue || ''
      });
    } catch (error: any) {
      // Se der erro por colunas não existentes, criar usando SQL direto
      if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
        logger.warn(`[FLOUP] Colunas condition/conditionValue não existem. Criando duplicado usando SQL direto.`);
        const sequelize = Floup.sequelize;
        
        try {
          // Verificar o nome exato da tabela
          const tableCheckResult: any = await sequelize.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND LOWER(table_name) = LOWER('Floups')
            LIMIT 1;
          `, { type: QueryTypes.SELECT });
          
          const actualTableName = tableCheckResult && tableCheckResult.length > 0 
            ? (tableCheckResult[0] as any).table_name 
            : 'Floups';
          
          logger.info(`[FLOUP] Usando nome da tabela para duplicação: ${actualTableName}`);
          
          const stepsJson = JSON.stringify(original.steps);
          const stopConditionsJson = JSON.stringify(original.stopConditions || []);
          const pauseConditionsJson = JSON.stringify(original.pauseConditions || []);
          const now = new Date();
          
          const insertResult: any = await sequelize.query(`
            INSERT INTO "${actualTableName}" ("companyId", "name", "description", "isActive", "steps", "stopConditions", "pauseConditions", "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)
            RETURNING "id", "companyId", "name", "description", "isActive", "steps", "stopConditions", "pauseConditions", "templateType", "createdAt", "updatedAt";
          `, {
            bind: [
              companyId,
              `${original.name} (Cópia)`,
              original.description,
              false,
              stepsJson,
              stopConditionsJson,
              pauseConditionsJson,
              now,
              now
            ],
            type: QueryTypes.SELECT
          });
          
          logger.info(`[FLOUP] Resultado do INSERT (duplicação):`, insertResult);
          
          if (insertResult && insertResult.length > 0 && (insertResult[0] as any).id) {
            const insertedId = (insertResult[0] as any).id;
            // ✅ CORRIGIDO: Buscar via SQL direto para evitar que Sequelize tente buscar colunas inexistentes
            const selectResult: any = await sequelize.query(`
              SELECT "id", "companyId", "name", "description", "isActive", "steps", "stopConditions", "pauseConditions", "templateType", "createdAt", "updatedAt"
              FROM "${actualTableName}"
              WHERE "id" = $1
            `, {
              bind: [insertedId],
              type: QueryTypes.SELECT
            });
            
            if (selectResult && selectResult.length > 0) {
              const row = selectResult[0];
              // Construir objeto Floup manualmente (sem usar o modelo para evitar busca de colunas inexistentes)
              floupDuplicado = {
                id: row.id,
                companyId: row.companyId,
                name: row.name,
                description: row.description || '',
                isActive: row.isActive,
                steps: row.steps || [],
                stopConditions: row.stopConditions || [],
                pauseConditions: row.pauseConditions || [],
                templateType: row.templateType || null,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                // Adicionar métodos necessários do Sequelize Model
                save: async () => floupDuplicado,
                update: async () => floupDuplicado,
                reload: async () => floupDuplicado,
                toJSON: () => ({
                  id: row.id,
                  companyId: row.companyId,
                  name: row.name,
                  description: row.description || '',
                  isActive: row.isActive,
                  steps: row.steps || [],
                  stopConditions: row.stopConditions || [],
                  pauseConditions: row.pauseConditions || [],
                  templateType: row.templateType || null,
                  createdAt: row.createdAt,
                  updatedAt: row.updatedAt
                })
              } as any;
              logger.info(`[FLOUP] Floup duplicado criado via SQL direto com sucesso. ID: ${floupDuplicado.id}`);
            } else {
              throw new Error(`Falha ao buscar Floup duplicado criado (ID: ${insertedId}) - nenhum resultado retornado`);
            }
          } else {
            logger.error(`[FLOUP] SQL direto não retornou resultados válidos:`, JSON.stringify(insertResult));
            throw new Error('Falha ao criar Floup duplicado via SQL direto - nenhum resultado retornado');
          }
        } catch (sqlError: any) {
          logger.error(`[FLOUP] Erro ao criar Floup duplicado via SQL direto:`, sqlError);
          logger.error(`[FLOUP] Stack trace:`, sqlError.stack);
          throw new Error(`Falha ao criar Floup duplicado via SQL direto: ${sqlError.message}`);
        }
      } else {
        throw error;
      }
    }
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-floup`, { action: 'create', floup: floupDuplicado });
    logger.info(`[FLOUP] service.duplicarFloup ✓ newId=${floupDuplicado.id}`);
    return floupDuplicado;
  }

  static async atualizarFloup(id: number, companyId: number, updates: any) {
    logger.info(`[FLOUP] service.atualizarFloup → id=${id}, companyId=${companyId}`);
    const floup = await safeFloupQuery<Floup | null>(
      () => Floup.findByPk(id),
      () => Floup.findByPk(id, { attributes: { exclude: ['condition', 'conditionValue'] } })
    );
    if (!floup || floup.companyId !== companyId) return null;
    
    // Log dos steps recebidos para debug
    if (updates.steps && updates.steps.length > 0) {
      logger.info(`[FLOUP] service.atualizarFloup → Steps recebidos: ${updates.steps.length} passos`);
      updates.steps.forEach((step: any, idx: number) => {
        logger.info(`[FLOUP] service.atualizarFloup → Passo ${idx + 1}: order=${step.order}, mediaUrl=${step.mediaUrl ? step.mediaUrl.substring(0, 100) + '...' : 'VAZIO'}, mediaType=${step.mediaType || 'N/A'}`);
      });
    }
    
    // Garantir que os steps sejam um array válido
    const stepsToSave = updates.steps && Array.isArray(updates.steps) ? updates.steps : floup.steps;
    
    // Log completo do JSON antes de salvar
    logger.info(`[FLOUP] service.atualizarFloup → JSON completo dos steps a serem salvos: ${JSON.stringify(stepsToSave, null, 2)}`);
    
    // Preparar dados para update
    const updateData: any = {
      name: updates.name || floup.name,
      description: updates.description !== undefined ? updates.description : floup.description,
      isActive: updates.isActive !== undefined ? updates.isActive : floup.isActive,
      steps: stepsToSave,
      stopConditions: updates.stopConditions !== undefined ? updates.stopConditions : floup.stopConditions,
      pauseConditions: updates.pauseConditions !== undefined ? updates.pauseConditions : floup.pauseConditions
    };
    
    // Tentar adicionar condition e conditionValue se existirem
    try {
      // Verificar se as colunas existem tentando acessá-las
      if ((floup as any).condition !== undefined || updates.condition !== undefined) {
        updateData.condition = updates.condition !== undefined ? updates.condition : ((floup as any).condition || 'queue');
      }
      if ((floup as any).conditionValue !== undefined || updates.conditionValue !== undefined) {
        updateData.conditionValue = updates.conditionValue !== undefined ? updates.conditionValue : ((floup as any).conditionValue || '');
      }
    } catch {
      // Se não conseguir acessar, não incluir essas colunas
    }
    
    // Tentar atualizar com todas as colunas primeiro
    try {
      await floup.update(updateData);
    } catch (error: any) {
      // Se der erro por colunas não existentes, atualizar sem essas colunas
      if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
        logger.warn(`[FLOUP] Colunas condition/conditionValue não existem. Atualizando sem elas.`);
        delete updateData.condition;
        delete updateData.conditionValue;
        await floup.update(updateData);
      } else {
        throw error;
      }
    }
    
    // Recarregar o floup para garantir que os dados estão atualizados
    await floup.reload();
    
    // Log dos steps salvos para verificar
    if (floup.steps && floup.steps.length > 0) {
      logger.info(`[FLOUP] service.atualizarFloup → Steps salvos: ${floup.steps.length} passos`);
      floup.steps.forEach((step: any, idx: number) => {
        logger.info(`[FLOUP] service.atualizarFloup → Passo ${idx + 1} salvo: order=${step.order}, mediaUrl=${step.mediaUrl ? step.mediaUrl.substring(0, 100) + '...' : 'VAZIO'}, mediaType=${step.mediaType || 'N/A'}`);
      });
    } else {
      logger.warn(`[FLOUP] service.atualizarFloup → Nenhum step encontrado após salvar!`);
    }
    
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-floup`, { action: 'update', floup });
    logger.info(`[FLOUP] service.atualizarFloup ✓ id=${id}`);
    return floup;
  }

  static async removerFloup(id: number, companyId: number): Promise<boolean> {
    logger.info(`[FLOUP] service.removerFloup → id=${id}, companyId=${companyId}`);
    const floup = await safeFloupQuery<Floup | null>(
      () => Floup.findByPk(id),
      () => Floup.findByPk(id, { attributes: { exclude: ['condition', 'conditionValue'] } })
    );
    if (!floup || floup.companyId !== companyId) return false;
    
    // Deletar todas as mídias do floup
    try {
      const fs = require('fs');
      const path = require('path');
      const publicFolder = path.resolve(__dirname, '..', '..', '..', 'public');
      const floupFolder = path.join(publicFolder, `company${companyId}`, 'floup', String(id));
      
      if (fs.existsSync(floupFolder)) {
        // Deletar todos os arquivos na pasta do floup
        const files = fs.readdirSync(floupFolder);
        files.forEach((file: string) => {
          try {
            const filePath = path.join(floupFolder, file);
            if (fs.statSync(filePath).isFile()) {
              fs.unlinkSync(filePath);
              logger.info(`[FLOUP] service.removerFloup → Arquivo deletado: ${filePath}`);
            }
          } catch (err: any) {
            logger.warn(`[FLOUP] service.removerFloup → Erro ao deletar arquivo ${file}: ${err.message}`);
          }
        });
        
        // Remover a pasta do floup
        try {
          fs.rmdirSync(floupFolder);
          logger.info(`[FLOUP] service.removerFloup → Pasta deletada: ${floupFolder}`);
        } catch (err: any) {
          logger.warn(`[FLOUP] service.removerFloup → Erro ao deletar pasta: ${err.message}`);
        }
      }
      
      // Também deletar mídias que possam estar nos steps (URLs antigas)
      if (floup.steps && Array.isArray(floup.steps)) {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
        const proxyPort = process.env.PROXY_PORT;
        const baseUrl = proxyPort ? `${backendUrl}:${proxyPort}` : backendUrl;
        
        floup.steps.forEach((step: any) => {
          if (step.mediaUrl && step.mediaUrl.includes(`/floup/${id}/`)) {
            try {
              // Extrair caminho do arquivo da URL
              const urlPath = step.mediaUrl.split('/public/')[1];
              if (urlPath) {
                const filePath = path.join(publicFolder, urlPath);
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                  logger.info(`[FLOUP] service.removerFloup → Mídia deletada: ${filePath}`);
                }
              }
            } catch (err: any) {
              logger.warn(`[FLOUP] service.removerFloup → Erro ao deletar mídia do step: ${err.message}`);
            }
          }
        });
      }
    } catch (err: any) {
      logger.warn(`[FLOUP] service.removerFloup → Erro ao deletar mídias: ${err.message}`);
    }
    
    const removed = await FloupSchedule.destroy({ where: { floupId: id, companyId } });
    await floup.destroy();
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-floup`, { action: 'delete', floupId: id });
    io.of(String(companyId)).emit(`company-${companyId}-floup-schedule`, { action: 'bulk_delete', floupId: id, removedCount: removed });
    logger.info(`[FLOUP] service.removerFloup ✓ id=${id}, removedSchedules=${removed}`);
    return true;
  }

  static async agendarFloup(floupId: number, companyId: number, ticketId: number) {
    logger.info(`[FLOUP] service.agendarFloup → floupId=${floupId}, ticketId=${ticketId}, companyId=${companyId}`);
    const floup = await safeFloupQuery<Floup | null>(
      () => Floup.findByPk(floupId),
      () => Floup.findByPk(floupId, { attributes: { exclude: ['condition', 'conditionValue'] } })
    );
    if (!floup || floup.companyId !== companyId) return null;
    const firstStep = (floup.steps || [])[0];
    if (!firstStep) throw new Error('Floup não possui passos configurados');
    const tz = await this.resolveCompanyTimezone(companyId);
    const initialNextRunAt = this.calcularProximoHorario(firstStep, undefined, tz);
    const agendamento = await FloupSchedule.create({ companyId, ticketId, floupId, currentStepIndex: 0, nextRunAt: initialNextRunAt, status: 'PENDING' });
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-floup-schedule`, { action: 'create', agendamento });
    logger.info(`[FLOUP] service.agendarFloup ✓ scheduleId=${agendamento.id}`);
    return agendamento;
  }

  static async cancelarAgendamento(scheduleId: number, companyId: number): Promise<boolean> {
    logger.info(`[FLOUP] service.cancelarAgendamento → scheduleId=${scheduleId}, companyId=${companyId}`);
    const agendamento = await FloupSchedule.findByPk(scheduleId);
    if (!agendamento || agendamento.companyId !== companyId) return false;
    await agendamento.destroy();
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-floup-schedule`, { action: 'delete', scheduleId });
    logger.info(`[FLOUP] service.cancelarAgendamento ✓ scheduleId=${scheduleId}`);
    return true;
  }

  static async listarAgendamentos(companyId: number, ticketId?: number) {
    logger.info(`[FLOUP] service.listarAgendamentos → companyId=${companyId}, ticketId=${ticketId}`);
    const where: any = { companyId };
    if (ticketId) where.ticketId = ticketId;
    const agendamentos = await FloupSchedule.findAll({ where, include: [{ model: Floup, as: 'floup', attributes: ['id', 'name', 'description', 'isActive'] }], order: [['nextRunAt', 'ASC']] });
    logger.info(`[FLOUP] service.listarAgendamentos ✓ count=${agendamentos.length}`);
    return agendamentos;
  }

  static async listarAgendamentosPorFloup(floupId: number, companyId: number) {
    logger.info(`[FLOUP] service.listarAgendamentosPorFloup → floupId=${floupId}, companyId=${companyId}`);
    return FloupSchedule.findAll({ where: { floupId, companyId }, order: [['nextRunAt', 'ASC']] });
  }

  static async verificarCondicoesParada(ticketId: number, companyId: number, stopConditions: any[]): Promise<boolean> {
    try {
      if (!stopConditions || stopConditions.length === 0) return false;
      const Ticket = (await import('../../models/Ticket')).default;
      const Message = (await import('../../models/Message')).default;
      const Contact = (await import('../../models/Contact')).default;
      const ContactTag = (await import('../../models/ContactTag')).default;
      const Tag = (await import('../../models/Tag')).default;
      const ticket = await Ticket.findByPk(ticketId, { include: [{ model: Contact, as: 'contact', include: [{ model: ContactTag, as: 'contactTags', include: [{ model: Tag, as: 'tag' }] }] }] });
      if (!ticket) return false;
      
      for (const condition of stopConditions) {
        if (!condition.enabled) continue;
        
        // 1. Caso o Contato responder qualquer mensagem
        if (condition.type === 'anyMessage') {
          // Verificar mensagens do contato nas últimas 24 horas
          const { Op } = require('sequelize');
          const twentyFourHoursAgo = new Date();
          twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
          
          const contactMessages = await Message.findAll({
            where: {
              ticketId,
              fromMe: false,
              createdAt: {
                [Op.gte]: twentyFourHoursAgo
              }
            },
            limit: 1,
            order: [['createdAt', 'DESC']]
          });
          if (contactMessages.length > 0) {
            logger.info(`[FLOUP] verificarCondicoesParada → Condição 'anyMessage' atendida para ticketId=${ticketId}`);
            return true;
          }
        }
        
        // 2. Caso o Contato responder uma Palavra chave
        if (condition.type === 'keyword' && condition.keyword) {
          const keyword = condition.keyword.trim().toLowerCase();
          if (keyword) {
            const contactMessages = await Message.findAll({
              where: {
                ticketId,
                fromMe: false
              },
              order: [['createdAt', 'DESC']],
              limit: 10 // Verificar últimas 10 mensagens do contato
            });
            for (const msg of contactMessages) {
              const messageBody = (msg.body || '').toLowerCase();
              if (messageBody.includes(keyword)) {
                logger.info(`[FLOUP] verificarCondicoesParada → Condição 'keyword' (${keyword}) atendida para ticketId=${ticketId}`);
                return true;
              }
            }
          }
        }
        
        // 3. Caso o Ticket for Fechado
        if (condition.type === 'ticketClosed') {
          if (ticket.status === 'closed') {
            logger.info(`[FLOUP] verificarCondicoesParada → Condição 'ticketClosed' atendida para ticketId=${ticketId}`);
            return true;
          }
        }
        
        // Manter compatibilidade com condições antigas (tag)
        if (condition.type === 'tag') {
          const contactTags = ticket.contact.contactTags || [];
          const hasTag = contactTags.some((ct: any) => ct.tag.name === condition.tagName);
          if ((condition.operator === 'equals' && hasTag) || (condition.operator === 'not_equals' && !hasTag)) return true;
        }
      }
      return false;
    } catch (error) {
      logger.error(`[FLOUP] verificarCondicoesParada → Erro:`, error);
      return false;
    }
  }

  static async verificarCondicoesPausa(ticketId: number, companyId: number, pauseConditions: any[]): Promise<boolean> {
    try {
      if (!pauseConditions || pauseConditions.length === 0) return false;
      const Ticket = (await import('../../models/Ticket')).default;
      const Contact = (await import('../../models/Contact')).default;
      const ContactTag = (await import('../../models/ContactTag')).default;
      const Tag = (await import('../../models/Tag')).default;
      const ticket = await Ticket.findByPk(ticketId, { include: [{ model: Contact, as: 'contact', include: [{ model: ContactTag, as: 'contactTags', include: [{ model: Tag, as: 'tag' }] }] }] });
      if (!ticket) return false;
      for (const condition of pauseConditions) {
        if (condition.type === 'tag') {
          const contactTags = ticket.contact.contactTags || [];
          const hasTag = contactTags.some((ct: any) => ct.tag.name === condition.tagName);
          if ((condition.operator === 'equals' && hasTag) || (condition.operator === 'not_equals' && !hasTag)) return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Resolve o timezone da empresa a partir do User mais antigo (super/admin).
   * Retorna IANA tz string (ex: "Europe/Madrid"). Default: "America/Sao_Paulo".
   */
  static async resolveCompanyTimezone(companyId: number): Promise<string> {
    try {
      const User = (await import('../../models/User')).default;
      const user = await User.findOne({
        where: { companyId },
        attributes: ['timezone'],
        order: [['id', 'ASC']]
      });
      const tz = (user as any)?.timezone;
      if (tz && typeof tz === 'string' && tz.length > 0) return tz;
    } catch (err) {
      logger.warn(`[FLOUP] resolveCompanyTimezone falhou para company ${companyId}: ${(err as any)?.message}`);
    }
    return 'America/Sao_Paulo';
  }

  static calcularProximoHorario(step: any, lastInteraction?: Date, timezone?: string): Date {
    const now = new Date();
    const tz = timezone || 'America/Sao_Paulo';
    
    // Se não tem mode, inferir baseado nas propriedades do step
    let mode = step.mode;
    if (!mode) {
      if (step.time) {
        mode = 'fixedTime';
      } else if (step.timeValue && step.timeUnit) {
        mode = 'interval';
      } else {
        mode = 'interval'; // Padrão: intervalo
      }
    }
    
    switch (mode) {
      case 'fixedTime': {
        // Usa timezone da empresa para interpretar "HH:mm" — corrige bug para clientes fora do BR
        const moment = require('moment-timezone');
        const [hStr, mStr] = (step.time || '08:00').split(':');
        const hours = parseInt(hStr) || 8;
        const minutes = parseInt(mStr) || 0;
        let nextRun = moment.tz(tz).hour(hours).minute(minutes).second(0).millisecond(0);
        if (nextRun.toDate() <= now) nextRun = nextRun.add(1, 'day');
        logger.info(`[FLOUP] calcularProximoHorario fixedTime → ${step.time} em tz=${tz} → ${nextRun.toDate().toISOString()}`);
        return nextRun.toDate();
      }
      case 'afterLastInteraction': {
        if (lastInteraction) {
          const timeValue = step.timeValue || step.afterMinutes || 0;
          const timeUnit = step.timeUnit || 'minutes';
          const minutesToAdd = this.convertTimeToMinutes(timeValue, timeUnit);
          const nextRunInteraction = new Date(lastInteraction);
          nextRunInteraction.setMinutes(nextRunInteraction.getMinutes() + minutesToAdd);
          return nextRunInteraction;
        }
        // Se não tem lastInteraction, usar timeValue/timeUnit como intervalo a partir de agora
        const timeValue = step.timeValue || 0;
        const timeUnit = step.timeUnit || 'minutes';
        return this.addTimeToDate(now, timeValue, timeUnit);
      }
      case 'afterLastAttendant': {
        if (lastInteraction) {
          const timeValue = step.timeValue || step.afterMinutes || 0;
          const timeUnit = step.timeUnit || 'minutes';
          const minutesToAdd = this.convertTimeToMinutes(timeValue, timeUnit);
          const nextRunAttendant = new Date(lastInteraction);
          nextRunAttendant.setMinutes(nextRunAttendant.getMinutes() + minutesToAdd);
          return nextRunAttendant;
        }
        // Se não tem lastInteraction, usar timeValue/timeUnit como intervalo a partir de agora
        const timeValue = step.timeValue || 0;
        const timeUnit = step.timeUnit || 'minutes';
        return this.addTimeToDate(now, timeValue, timeUnit);
      }
      case 'interval': {
        // Use nullish coalescing so timeValue=0 (envio imediato) é respeitado
        const timeValue = step.timeValue ?? step.intervalDays ?? 1;
        // Se o usuário definiu timeUnit (minutes/hours/days), preservar.
        // Só cair em 'days' quando intervalDays foi usado (legado) e timeUnit não veio.
        const timeUnit = step.timeUnit
          || (step.intervalDays != null ? 'days' : 'minutes');
        return this.addTimeToDate(now, timeValue, timeUnit);
      }
      default: {
        // Fallback: usar timeValue/timeUnit se disponível
        if (step.timeValue && step.timeUnit) {
          return this.addTimeToDate(now, step.timeValue, step.timeUnit);
        }
        // Se não tem nada, executar imediatamente
        return now;
      }
    }
  }

  // Método auxiliar para converter tempo para minutos
  static convertTimeToMinutes(value: number, unit: string): number {
    switch (unit) {
      case 'minutes': return value;
      case 'hours': return value * 60;
      case 'days': return value * 24 * 60;
      case 'weeks': return value * 7 * 24 * 60;
      case 'months': return value * 30 * 24 * 60;
      case 'years': return value * 365 * 24 * 60;
      default: return value;
    }
  }

  // Método auxiliar para adicionar tempo a uma data
  static addTimeToDate(date: Date, value: number, unit: string): Date {
    const result = new Date(date);
    switch (unit) {
      case 'minutes':
        result.setMinutes(result.getMinutes() + value);
        break;
      case 'hours':
        result.setHours(result.getHours() + value);
        break;
      case 'days':
        result.setDate(result.getDate() + value);
        break;
      case 'weeks':
        result.setDate(result.getDate() + (value * 7));
        break;
      case 'months':
        result.setMonth(result.getMonth() + value);
        break;
      case 'years':
        result.setFullYear(result.getFullYear() + value);
        break;
      default:
        result.setMinutes(result.getMinutes() + value);
    }
    return result;
  }

  static async executarPasso(floupId: number, ticketId: number, stepIndex: number) {
    logger.info(`[FLOUP] service.executarPasso → floupId=${floupId}, ticketId=${ticketId}, stepIndex=${stepIndex}`);
    const floup = await safeFloupQuery<Floup | null>(
      () => Floup.findByPk(floupId),
      () => Floup.findByPk(floupId, { attributes: { exclude: ['condition', 'conditionValue'] } })
    );
    if (!floup) return { sent: false, reason: 'Floup não encontrado' } as any;
    if (!floup.steps || stepIndex >= floup.steps.length) {
      return { sent: false, reason: `Passo ${stepIndex + 1} não existe (total ${floup.steps?.length || 0})` } as any;
    }
    const step = (floup.steps as any[])[stepIndex];
    const Ticket = (await import('../../models/Ticket')).default;
    const Contact = (await import('../../models/Contact')).default;
    const ticket = await Ticket.findByPk(ticketId, { include: [{ model: Contact, as: 'contact' }] });
    if (!ticket) return { sent: false, reason: `Ticket ${ticketId} não encontrado` } as any;
    
    // Verificar condições de parada
    const shouldStop = await this.verificarCondicoesParada(ticketId, floup.companyId, floup.stopConditions || []);
    if (shouldStop) {
      logger.info(`[FLOUP] service.executarPasso → Condições de parada atendidas, cancelando`);
      return { sent: false, reason: 'STOP', stopped: true } as any;
    }
    
    // Verificar condições de pausa
    const shouldPause = await this.verificarCondicoesPausa(ticketId, floup.companyId, floup.pauseConditions || []);
    if (shouldPause) {
      logger.info(`[FLOUP] service.executarPasso → Condições de pausa atendidas, pausando`);
      return { sent: false, reason: 'PAUSE', paused: true } as any;
    }
    let sent = false;
    let reason: string | undefined;
    if (ticket.channel === 'evolution') {
      sent = false;
      reason = 'Canal "evolution" não suportado';
    } else if (ticket.channel === 'whatsapp') {
      const r = await this.sendWhatsAppMessage(ticket, step);
      sent = r === true || (r as any)?.sent === true;
      if (!sent) reason = (r as any)?.error || 'Falha no envio WhatsApp';
    } else if (ticket.channel === 'wacalls') {
      // O WhatsApp Plus se identifica como "wacalls". Este ramo faltava, e por
      // isso todo passo agendado nessa conexão caía no "canal não suportado"
      // lá embaixo: o Follow UP rodava, marcava a tentativa e não entregava
      // nada.
      const r = await this.sendWacallsMessage(ticket, step);
      sent = r === true || (r as any)?.sent === true;
      if (!sent) reason = (r as any)?.error || 'Falha no envio WhatsApp Plus';
    } else if (ticket.channel === 'whatsapp_oficial') {
      const r = await this.sendWhatsAppOficialMessage(ticket, step);
      sent = r === true || (r as any)?.sent === true;
      if (!sent) reason = (r as any)?.error || 'Falha no envio WhatsApp Oficial';
    } else if (["facebook", "instagram"].includes(ticket.channel)) {
      const r = await this.sendFacebookMessage(ticket, step);
      sent = r === true || (r as any)?.sent === true;
      if (!sent) reason = (r as any)?.error || `Falha no envio ${ticket.channel}`;
    } else {
      reason = `Canal "${ticket.channel}" não suportado`;
    }
    if (sent && step.tagOnSend) {
      await this.applyTagToTicket(ticketId, step.tagOnSend, floup.companyId);
    }
    logger.info(`[FLOUP] service.executarPasso ✓ sent=${sent}${reason ? ` reason=${reason}` : ''}`);
    return { sent, reason } as any;
  }

  static async sendEvolutionMessage(ticket: any, step: any): Promise<any> { return { sent: false, error: 'Canal evolution não implementado' }; }

  static async sendWhatsAppMessage(ticket: any, step: any): Promise<any> {
    try {
      if (step.mediaUrl) {
        const fs = require('fs');
        const path = require('path');
        const publicFolder = path.resolve(__dirname, '..', '..', '..', 'public');
        const companyFolder = path.join(publicFolder, `company${ticket.companyId}`);
        const floupFolder = path.join(companyFolder, 'floup');
        
        // Verificar se é uma data URI (data:image/jpeg;base64,...)
        if (step.mediaUrl.startsWith('data:')) {
          // Extrair mime type e dados base64
          const matches = step.mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (!matches || matches.length < 3) {
            throw new Error('Formato de data URI inválido');
          }
          
          const mimeType = matches[1];
          const base64Data = matches[2];
          
          // Converter base64 para buffer
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Determinar extensão do arquivo baseado no mime type
          const extension = mimeType.split('/')[1]?.split(';')[0] || 'jpg';
          const timestamp = Date.now();
          const filename = `floup_${timestamp}.${extension}`;
          
          // Garantir que a pasta existe
          if (!fs.existsSync(floupFolder)) {
            fs.mkdirSync(floupFolder, { recursive: true });
          }
          
          // Salvar em arquivo temporário
          const tempPath = path.join(floupFolder, filename);
          fs.writeFileSync(tempPath, buffer);
          
          // O caminho deve ser relativo à pasta public
          const relativePath = `company${ticket.companyId}/floup/${filename}`;
          const defaultSendWhatsAppMedia = (await import('../../services/WbotServices/SendWhatsAppMedia')).default as any;
          await defaultSendWhatsAppMedia({ 
            media: { 
              filename, 
              path: relativePath, 
              mimetype: mimeType,
              originalname: filename
            } as any, 
            ticket, 
            body: step.message 
          });
          
          // Limpar arquivo temporário após envio
          setTimeout(() => {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          }, 5000);
        } else if (step.mediaUrl.startsWith('http://') || step.mediaUrl.startsWith('https://')) {
          // ── URL de MÍDIA vs URL de SITE ─────────────────────────────────
          // Antes, QUALQUER endereço http/https caía direto no download e ia
          // como anexo. Colar o link de um site (ex: www.seusite.com.br) no
          // passo fazia o servidor baixar a página e mandar um .HTML de uns
          // 20 kB pro cliente, em vez do link clicável — era isso que estava
          // acontecendo no Follow Up.
          //
          // Só tratamos como mídia quando o endereço termina numa extensão de
          // arquivo conhecida. Qualquer outra coisa é considerada link e vai
          // no corpo da mensagem, que é o que o WhatsApp transforma em
          // pré-visualização clicável.
          const EXTENSOES_DE_MIDIA = /\.(jpg|jpeg|png|gif|webp|bmp|svg|mp4|3gp|mov|avi|mkv|webm|mp3|ogg|wav|m4a|aac|opus|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar|7z)(\?.*)?$/i;
          const caminhoDaUrl = step.mediaUrl.split('?')[0];
          const ehArquivoDeMidia = EXTENSOES_DE_MIDIA.test(caminhoDaUrl);

          if (!ehArquivoDeMidia) {
            // Link comum: manda como texto. Se o passo tiver mensagem, o link
            // entra depois dela; se não tiver, vai o link sozinho.
            const corpoComLink = step.message
              ? `${step.message}\n\n${step.mediaUrl}`
              : step.mediaUrl;
            const SendWhatsAppMessageFn = (await import('../../services/WbotServices/SendWhatsAppMessage')).default as any;
            await SendWhatsAppMessageFn({ body: corpoComLink, ticket });
            return;
          }

          // Para URLs, fazer download temporário
          const https = require('https');
          const http = require('http');
          
          if (!fs.existsSync(floupFolder)) {
            fs.mkdirSync(floupFolder, { recursive: true });
          }
          
          const filename = this.getFilenameFromUrl(step.mediaUrl) || `floup_${Date.now()}.jpg`;
          const timestamp = Date.now();
          const tempPath = path.join(floupFolder, `${timestamp}_${filename}`);
          
          // Download da URL
          await new Promise((resolve, reject) => {
            const protocol = step.mediaUrl.startsWith('https://') ? https : http;
            const file = fs.createWriteStream(tempPath);
            protocol.get(step.mediaUrl, (response: any) => {
              response.pipe(file);
              file.on('finish', () => {
                file.close();
                resolve(true);
              });
            }).on('error', (err: any) => {
              if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
              }
              reject(err);
            });
          });
          
          // Enviar mídia do arquivo baixado
          // O caminho deve ser relativo à pasta public (ex: company1/floup/1234567890_image.jpg)
          const relativePath = `company${ticket.companyId}/floup/${timestamp}_${filename}`;
          const defaultSendWhatsAppMedia = (await import('../../services/WbotServices/SendWhatsAppMedia')).default as any;
          await defaultSendWhatsAppMedia({ 
            media: { 
              filename, 
              path: relativePath, 
              mimetype: this.getMimeTypeFromUrl(step.mediaUrl),
              originalname: filename
            } as any, 
            ticket, 
            body: step.message 
          });
          
          // Limpar arquivo temporário após envio
          setTimeout(() => {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          }, 5000);
        } else {
          // Arquivo local - pode ser caminho relativo (company1/floup/arquivo.jpg) ou URL completa do backend
          let mediaPath = step.mediaUrl;
          
          // Se for uma URL do backend (ex: http://localhost:3000/public/company1/floup/arquivo.jpg)
          // Extrair o caminho relativo
          if (mediaPath.includes('/public/')) {
            mediaPath = mediaPath.split('/public/')[1];
          }
          
          // Se não começar com "company", adicionar
          if (!mediaPath.startsWith('company')) {
            mediaPath = `company${ticket.companyId}/floup/${mediaPath}`;
          }
          
          const defaultSendWhatsAppMedia = (await import('../../services/WbotServices/SendWhatsAppMedia')).default as any;
          await defaultSendWhatsAppMedia({ 
            media: { 
              filename: this.getFilenameFromUrl(step.mediaUrl), 
              path: mediaPath, 
              mimetype: this.getMimeTypeFromUrl(step.mediaUrl),
              originalname: this.getFilenameFromUrl(step.mediaUrl)
            } as any, 
            ticket, 
            body: step.message 
          });
        }
      } else {
        const defaultSendWhatsAppMessage = (await import('../../services/WbotServices/SendWhatsAppMessage')).default as any;
        await defaultSendWhatsAppMessage({ body: step.message, ticket });
      }
      return { sent: true } as any;
    } catch (error: any) {
      logger.error(`[FLOUP] service.sendWhatsAppMessage → Erro:`, error);
      return { sent: false, error: error?.message || String(error) } as any;
    }
  }

  /**
   * Envio de um passo do Follow UP pelo WhatsApp Plus (canal "wacalls").
   *
   * Três cuidados que diferenciam este caminho do Baileys:
   *
   *   1. A CONEXÃO precisa vir junto. `executarPasso` carrega o ticket só com
   *      o contato, mas o serviço de envio lê
   *      `ticket.whatsapp.wacallsChatSessionId` pra saber com qual sessão do
   *      microserviço falar. Sem recarregar, todo envio morreria em
   *      "conexão não pareada".
   *
   *   2. A mídia vai por caminho ABSOLUTO em disco. O SendWhatsAppMedia do
   *      Baileys recebe caminho relativo à pasta public; o do WhatsApp Plus
   *      lê o arquivo direto.
   *
   *   3. Sempre mandamos uma CÓPIA, nunca o arquivo original. O serviço de
   *      envio move o arquivo pra pasta da empresa (renameSync). Se
   *      entregássemos o original guardado em company{N}/floup, ele sumiria
   *      dali no primeiro contato e todos os seguintes falhariam por "mídia
   *      não encontrada" — o passo funcionaria uma vez só.
   */
  static async sendWacallsMessage(ticket: any, step: any): Promise<any> {
    const fs = require('fs');
    const path = require('path');
    let copiaTemporaria: string | null = null;

    try {
      const Ticket = (await import('../../models/Ticket')).default;
      const Contact = (await import('../../models/Contact')).default;
      const Whatsapp = (await import('../../models/Whatsapp')).default;

      const ticketCompleto: any = await Ticket.findByPk(ticket.id, {
        include: [
          { model: Contact, as: 'contact' },
          { model: Whatsapp, as: 'whatsapp' }
        ]
      });
      if (!ticketCompleto) {
        return { sent: false, error: `Ticket ${ticket.id} não encontrado` } as any;
      }
      if (!ticketCompleto.whatsapp?.wacallsChatSessionId) {
        return {
          sent: false,
          error: 'Conexão WhatsApp Plus sem sessão pareada'
        } as any;
      }

      const { SendWacallsText, SendWacallsMediaMessage } = await import(
        '../../services/WacallsServices/SendWacallsMessageService'
      );

      if (!step.mediaUrl) {
        await SendWacallsText({ ticket: ticketCompleto, body: step.message });
        return { sent: true } as any;
      }

      const publicFolder = path.resolve(__dirname, '..', '..', '..', 'public');
      const pastaFloup = path.join(
        publicFolder,
        `company${ticketCompleto.companyId}`,
        'floup'
      );
      if (!fs.existsSync(pastaFloup)) fs.mkdirSync(pastaFloup, { recursive: true });

      const midia = String(step.mediaUrl);
      let nomeOriginal = '';

      if (midia.startsWith('data:')) {
        const partes = midia.match(/^data:([^;]+);base64,(.+)$/);
        if (!partes || partes.length < 3) {
          throw new Error('Formato de data URI inválido');
        }
        const extensao = partes[1].split('/')[1]?.split(';')[0] || 'jpg';
        nomeOriginal = `floup_${Date.now()}.${extensao}`;
        copiaTemporaria = path.join(pastaFloup, `envio_${Date.now()}_${nomeOriginal}`);
        fs.writeFileSync(copiaTemporaria, Buffer.from(partes[2], 'base64'));
      } else if (/^https?:\/\//.test(midia) && !midia.includes('/public/')) {
        // URL externa: o serviço de envio lê do disco, então baixamos antes.
        const axios = (await import('axios')).default;
        nomeOriginal = this.getFilenameFromUrl(midia) || `floup_${Date.now()}.jpg`;
        copiaTemporaria = path.join(pastaFloup, `envio_${Date.now()}_${nomeOriginal}`);
        const resposta = await axios.get(midia, {
          responseType: 'arraybuffer',
          timeout: 30000
        });
        fs.writeFileSync(copiaTemporaria, Buffer.from(resposta.data));
      } else {
        // Arquivo já guardado na pasta public. Aceita tanto a URL do próprio
        // backend quanto o caminho relativo — os dois formatos que a tela de
        // Follow UP grava.
        let relativo = midia;
        if (relativo.includes('/public/')) relativo = relativo.split('/public/')[1];
        if (!relativo.startsWith('company')) {
          relativo = `company${ticketCompleto.companyId}/floup/${relativo}`;
        }
        const origem = path.join(publicFolder, relativo);
        nomeOriginal = path.basename(origem);

        if (!fs.existsSync(origem)) {
          // Perder o passo inteiro por causa do anexo seria pior que entregar
          // só o texto, então seguimos com o texto e registramos o motivo.
          logger.warn(
            `[FLOUP][wacalls] Mídia não encontrada em ${origem}; enviando só o texto.`
          );
          await SendWacallsText({ ticket: ticketCompleto, body: step.message });
          return { sent: true } as any;
        }

        copiaTemporaria = path.join(pastaFloup, `envio_${Date.now()}_${nomeOriginal}`);
        fs.copyFileSync(origem, copiaTemporaria);
      }

      // mimetype genérico de propósito: o serviço de envio detecta o tipo real
      // pela assinatura binária do arquivo (resolveMediaKind) e corrige, o que
      // é mais confiável do que adivinhar pela extensão do nome.
      const arquivo: any = {
        fieldname: 'file',
        originalname: nomeOriginal,
        encoding: '7bit',
        mimetype: 'application/octet-stream',
        size: fs.statSync(copiaTemporaria).size,
        destination: path.dirname(copiaTemporaria),
        filename: path.basename(copiaTemporaria),
        path: copiaTemporaria
      };

      await SendWacallsMediaMessage({
        ticket: ticketCompleto,
        media: arquivo,
        body: step.message
      });

      return { sent: true } as any;
    } catch (error: any) {
      logger.error(`[FLOUP] service.sendWacallsMessage → Erro:`, error);
      return { sent: false, error: error?.message || String(error) } as any;
    } finally {
      // O envio normalmente já consumiu a cópia (ela é movida pra pasta da
      // empresa). Isto só limpa o resto quando o envio falhou no meio.
      if (copiaTemporaria) {
        const alvo = copiaTemporaria;
        setTimeout(() => {
          try {
            if (fs.existsSync(alvo)) fs.unlinkSync(alvo);
          } catch (e) {
            /* limpeza best-effort */
          }
        }, 15000);
      }
    }
  }

  static async sendWhatsAppOficialMessage(ticket: any, step: any): Promise<any> {
    try {
      const SendWhatsAppOficialMessage = (await import('../../services/WhatsAppOficial/SendWhatsAppOficialMessage')).default as any;

      // A CONEXÃO precisa vir junto — mesmo cuidado já tomado no ramo do
      // WhatsApp Plus (ver sendWacallsMessage). `executarPasso` carrega o
      // ticket só com o contato, e o serviço de envio lê
      // `ticket.whatsapp.token` para falar com a API Oficial. Sem recarregar,
      // todo passo morria em "Token da conexão WhatsApp Oficial não
      // encontrado", com o log registrando "whatsapp carregado=false".
      const Ticket = (await import('../../models/Ticket')).default;
      const Contact = (await import('../../models/Contact')).default;
      const Whatsapp = (await import('../../models/Whatsapp')).default;

      const ticketCompleto: any = await Ticket.findByPk(ticket.id, {
        include: [
          { model: Contact, as: 'contact' },
          { model: Whatsapp, as: 'whatsapp' }
        ]
      });

      if (!ticketCompleto) {
        return { sent: false, error: `Ticket ${ticket.id} não encontrado` } as any;
      }

      if (!ticketCompleto.whatsapp?.token) {
        // Mensagem específica: distingue "não carreguei a conexão" de
        // "a conexão existe mas está sem token cadastrado".
        return {
          sent: false,
          error: `Conexão oficial ${ticketCompleto.whatsappId} está sem token cadastrado`
        } as any;
      }

      ticket = ticketCompleto;
      
      // Se o step tem template configurado, enviar como template
      if (step.useTemplate && step.templateName && step.templateLanguage) {
        const templatePayload: any = {
          name: step.templateName,
          language: { code: step.templateLanguage },
        };
        // Adicionar componentes/variáveis se existirem
        if (step.templateComponents && step.templateComponents.length > 0) {
          templatePayload.components = step.templateComponents;
        }
        await SendWhatsAppOficialMessage({ 
          body: step.message || step.templateName, 
          ticket, 
          type: 'template', 
          template: templatePayload 
        });
        return { sent: true } as any;
      }
      
      // Envio normal (texto/media)
      if (step.mediaUrl) {
        await SendWhatsAppOficialMessage({ body: step.message, ticket, type: 'document', media: { path: step.mediaUrl, mimetype: this.getMimeTypeFromUrl(step.mediaUrl), originalname: this.getFilenameFromUrl(step.mediaUrl) } });
      } else {
        await SendWhatsAppOficialMessage({ body: step.message, ticket, type: 'text', media: null });
      }
      return { sent: true } as any;
    } catch (err: any) {
      logger.error(`[FLOUP] service.sendWhatsAppOficialMessage → Erro:`, err);
      return { sent: false, error: err?.message || String(err) } as any;
    }
  }

  static async sendFacebookMessage(ticket: any, step: any): Promise<any> {
    try {
      const mod = await import('../../services/FacebookServices/sendFacebookMessage');
      await mod.sendFacebookMessage({ body: step.message, ticket });
      return { sent: true } as any;
    } catch (err: any) {
      return { sent: false, error: err?.message || String(err) } as any;
    }
  }

  static async applyTagToTicket(ticketId: number, tagName: string, companyId: number): Promise<void> {
    try {
      const Tag = (await import('../../models/Tag')).default;
      const TicketTag = (await import('../../models/TicketTag')).default;
      let tag = await Tag.findOne({ where: { name: tagName, companyId } });
      if (!tag) {
        tag = await Tag.create({ name: tagName, color: '#000000', companyId });
      }
      const existingTag = await TicketTag.findOne({ where: { ticketId, tagId: tag.id } });
      if (!existingTag) {
        await TicketTag.create({ ticketId, tagId: tag.id });
      }
    } catch {}
  }

  static getMimeTypeFromUrl(url: string): string {
    const extension = url.split('.').pop()?.toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      mp4: 'video/mp4',
      avi: 'video/avi',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return mimeTypes[extension || ''] || 'application/octet-stream';
  }

  static getFilenameFromUrl(url: string): string {
    return url.split('/').pop() || `floup_media_${Date.now()}`;
  }
  // Atrelar floup a um contato
  static async atrelarFloupAContato(floupId: number, companyId: number, contactId: number, ticketId?: number) {
    logger.info(`[FLOUP] service.atrelarFloupAContato → floupId=${floupId}, contactId=${contactId}, ticketId=${ticketId}, companyId=${companyId}`);
    const floup = await safeFloupQuery<Floup | null>(
      () => Floup.findOne({ where: { id: floupId, companyId, isActive: true } }),
      () => Floup.findOne({ 
        where: { id: floupId, companyId, isActive: true },
        attributes: { exclude: ['condition', 'conditionValue'] }
      })
    );
    if (!floup) return null;
    const existing = await FloupSchedule.findOne({ where: { contactId, companyId, status: 'PENDING' } });
    if (existing) throw new Error('Já existe um floup ativo para este contato');
    const schedules: FloupSchedule[] = [] as any;
    const now = new Date();
    
    // Buscar última interação do contato se necessário
    let lastInteraction: Date | undefined;
    if (ticketId) {
      const Ticket = (await import('../../models/Ticket')).default;
      const Message = (await import('../../models/Message')).default;
      const lastMessage = await Message.findOne({
        where: { ticketId, fromMe: false },
        order: [['createdAt', 'DESC']]
      });
      if (lastMessage) {
        lastInteraction = lastMessage.createdAt;
      }
    }
    
    // Criar apenas um schedule inicial para o primeiro passo
    const firstStep = floup.steps[0];
    if (!firstStep) {
      throw new Error('Floup não possui passos configurados');
    }
    
    // Calcular horário do primeiro passo
    const tz = await this.resolveCompanyTimezone(companyId);
    let nextRunAt = this.calcularProximoHorario(firstStep, lastInteraction, tz);
    // Para modo interval sem valor, aplicar mínimo de 1 minuto.
    // Para fixedTime, respeitar o horário configurado.
    const isImmediateInterval = (firstStep.mode === 'interval' || !firstStep.mode) && 
                                 (!firstStep.timeValue || firstStep.timeValue === 0);
    if (isImmediateInterval && (nextRunAt <= now || (nextRunAt.getTime() - now.getTime()) < 60000)) {
      nextRunAt = new Date(now.getTime() + 60000); // 1 minuto a partir de agora
    } else if (firstStep.mode !== 'fixedTime' && nextRunAt <= now) {
      // Para outros modos que resultarem no passado, adicionar 1 minuto
      nextRunAt = new Date(now.getTime() + 60000);
    }
    
    const schedule = await FloupSchedule.create({
      floupId: floup.id,
      contactId,
      ticketId,
      stepOrder: firstStep.order || 1,
      stepData: firstStep,
      currentStepIndex: 0,
      nextRunAt,
      status: 'PENDING',
      companyId
    });
    schedules.push(schedule);
    logger.info(`[FLOUP] service.atrelarFloupAContato → Primeiro passo agendado para ${nextRunAt.toISOString()}`);
    
    // Emitir evento Socket.IO para atualizar o frontend imediatamente
    try {
      const io = getIO();
      // Buscar o schedule completo com relacionamentos para enviar ao frontend
      const scheduleWithRelations = await FloupSchedule.findByPk(schedule.id, {
        include: [
          { model: Floup, as: 'floup', attributes: ['id', 'name', 'description', 'isActive', 'steps'] },
          { model: Contact, as: 'contact', attributes: ['id', 'name', 'number'] }
        ]
      });
      
      // Emitir evento para o frontend atualizar imediatamente
      io.of(String(companyId)).emit(`company-${companyId}-floup-assigned`, {
        action: 'assign',
        contactId,
        floupId,
        ticketId,
        schedule: scheduleWithRelations,
        schedulesCount: schedules.length
      });
      
      // Também emitir evento de schedule criado (para compatibilidade)
      io.of(String(companyId)).emit(`company-${companyId}-floup-schedule`, {
        action: 'create',
        agendamento: scheduleWithRelations
      });
      
      logger.info(`[FLOUP] service.atrelarFloupAContato → Eventos Socket.IO emitidos: floup-assigned e floup-schedule`);
    } catch (socketError: any) {
      logger.error(`[FLOUP] service.atrelarFloupAContato → Erro ao emitir eventos Socket.IO: ${socketError.message}`);
    }
    
    logger.info(`[FLOUP] service.atrelarFloupAContato ✓ schedules=${schedules.length}`);
    return { floup, schedules };
  }

  // Obter histórico detalhado de um contato em um Floup
  static async obterHistoricoContato(floupId: number, companyId: number, contactId: number) {
    logger.info(`[FLOUP] service.obterHistoricoContato → floupId=${floupId}, contactId=${contactId}`);
    
    const Ticket = (await import('../../models/Ticket')).default;
    
    // Buscar o Floup para ter os steps
    let floup;
    try {
      floup = await Floup.findOne({ where: { id: floupId, companyId } });
    } catch (e: any) {
      if (e.message?.includes('column') && e.message?.includes('does not exist')) {
        floup = await Floup.findOne({ where: { id: floupId, companyId }, attributes: { exclude: ['condition', 'conditionValue'] } });
      } else throw e;
    }
    if (!floup) return null;

    // Buscar todos os schedules (histórico completo)
    const schedules = await FloupSchedule.findAll({
      where: { floupId, companyId, contactId },
      include: [
        { model: Contact, as: 'contact', attributes: ['id', 'name', 'number', 'profilePicUrl'] },
        { model: Ticket, as: 'ticket', attributes: ['id', 'uuid', 'channel', 'status'], required: false }
      ],
      order: [['stepOrder', 'ASC'], ['createdAt', 'ASC']]
    });

    const steps = floup.steps || [];
    const timelineMap = new Map<number, any>();

    const getStatusPresentation = (status: string) => {
      switch (status) {
        case 'COMPLETED':
          return { statusLabel: 'Enviado', statusColor: '#10b981' };
        case 'CANCELLED':
          return { statusLabel: 'Cancelado', statusColor: '#ef4444' };
        case 'PAUSED':
          return { statusLabel: 'Pausado', statusColor: '#f59e0b' };
        case 'ERROR':
          return { statusLabel: 'Erro', statusColor: '#ef4444' };
        case 'INACTIVE':
          return { statusLabel: 'Inativo', statusColor: '#94a3b8' };
        case 'PENDING':
        default:
          return { statusLabel: 'Aguardando', statusColor: '#3b82f6' };
      }
    };

    const getTimelinePriority = (status: string) => {
      switch (status) {
        case 'COMPLETED':
          return 4;
        case 'PENDING':
          return 3;
        case 'PAUSED':
          return 2;
        case 'ERROR':
        case 'CANCELLED':
        default:
          return 1;
      }
    };

    const getTimelineTimestamp = (item: any) => {
      if (item.status === 'COMPLETED') {
        return new Date(item.updatedAt || item.createdAt || 0).getTime();
      }

      if (item.status === 'PENDING') {
        return new Date(item.nextRunAt || item.updatedAt || item.createdAt || 0).getTime();
      }

      return new Date(item.updatedAt || item.createdAt || 0).getTime();
    };

    const upsertTimelineItem = (stepIndex: number, payload: any) => {
      const existingItem = timelineMap.get(stepIndex);

      if (!existingItem) {
        timelineMap.set(stepIndex, payload);
        return;
      }

      const existingPriority = getTimelinePriority(existingItem.status);
      const nextPriority = getTimelinePriority(payload.status);

      if (existingItem.status === 'COMPLETED' && payload.status === 'COMPLETED') {
        return;
      }

      const existingTimestamp = getTimelineTimestamp(existingItem);
      const nextTimestamp = getTimelineTimestamp(payload);

      if (
        nextTimestamp > existingTimestamp ||
        (nextTimestamp === existingTimestamp && nextPriority >= existingPriority)
      ) {
        timelineMap.set(stepIndex, { ...existingItem, ...payload });
      }
    };

    // 1) Source executed steps from FloupStepEvent (one entry per executed step)
    let stepEvents: any[] = [];
    try {
      stepEvents = await FloupStepEvent.findAll({
        where: { companyId, floupId, contactId },
        include: [
          { model: Ticket, as: 'ticket', attributes: ['id', 'uuid', 'channel'], required: false }
        ],
        order: [['stepIndex', 'ASC'], ['executedAt', 'ASC']]
      });
    } catch (evtErr) {
      logger.warn(`[FLOUP] obterHistoricoContato → Falha ao buscar FloupStepEvents:`, evtErr);
    }

    for (const evt of stepEvents) {
      const stepIndex = Math.max(Number(evt.stepIndex) || 0, 0);
      const stepInfo = steps[stepIndex] || (evt.stepData || {});
      const presentation = getStatusPresentation(evt.status || 'COMPLETED');

      upsertTimelineItem(stepIndex, {
        scheduleId: `event-${evt.id}`,
        stepIndex,
        stepOrder: evt.stepOrder || stepInfo.order || (stepIndex + 1),
        stepMessage: stepInfo.message || `Etapa ${stepIndex + 1}`,
        stepMediaUrl: stepInfo.mediaUrl || null,
        stepMediaType: stepInfo.mediaType || null,
        status: evt.status || 'COMPLETED',
        ...presentation,
        nextRunAt: null,
        createdAt: evt.createdAt,
        updatedAt: evt.executedAt || evt.updatedAt,
        channel: evt.ticket?.channel || 'N/A',
        ticketUuid: evt.ticket?.uuid || null,
      });
    }

    // 2) Fallback: for legacy schedules without recorded events, infer completed
    //    steps from currentStepIndex so existing data still shows up correctly.
    for (const schedule of schedules) {
      const currentStepIndex = Math.max(schedule.currentStepIndex || 0, 0);
      const lastCompletedStepIndex = schedule.status === 'COMPLETED'
        ? Math.min(currentStepIndex, Math.max(steps.length - 1, 0))
        : Math.max(currentStepIndex - 1, -1);

      for (let stepIndex = 0; stepIndex <= lastCompletedStepIndex; stepIndex += 1) {
        // Skip if this step already has an event-sourced entry
        if (timelineMap.has(stepIndex)) continue;

        const stepInfo = steps[stepIndex] || {};
        const presentation = getStatusPresentation('COMPLETED');

        upsertTimelineItem(stepIndex, {
          scheduleId: `${schedule.id}-${stepIndex}-completed`,
          stepIndex,
          stepOrder: stepInfo.order || (stepIndex + 1),
          stepMessage: stepInfo.message || `Etapa ${stepIndex + 1}`,
          stepMediaUrl: stepInfo.mediaUrl || null,
          stepMediaType: stepInfo.mediaType || null,
          status: 'COMPLETED',
          ...presentation,
          nextRunAt: null,
          createdAt: schedule.createdAt,
          updatedAt: schedule.updatedAt,
          channel: schedule.ticket?.channel || 'N/A',
          ticketUuid: schedule.ticket?.uuid || null,
        });
      }

      const shouldIncludeCurrentStep = currentStepIndex < steps.length || steps.length === 0;

      if (
        shouldIncludeCurrentStep &&
        schedule.status !== 'COMPLETED' &&
        schedule.status !== 'PENDING'
      ) {
        const stepInfo = steps[currentStepIndex] || {};
        const presentation = getStatusPresentation(schedule.status);

        upsertTimelineItem(currentStepIndex, {
          scheduleId: schedule.id,
          stepIndex: currentStepIndex,
          stepOrder: schedule.stepOrder || stepInfo.order || (currentStepIndex + 1),
          stepMessage: stepInfo.message || `Etapa ${currentStepIndex + 1}`,
          stepMediaUrl: stepInfo.mediaUrl || null,
          stepMediaType: stepInfo.mediaType || null,
          status: schedule.status,
          ...presentation,
          nextRunAt: schedule.nextRunAt,
          createdAt: schedule.createdAt,
          updatedAt: schedule.updatedAt,
          channel: schedule.ticket?.channel || 'N/A',
          ticketUuid: schedule.ticket?.uuid || null,
        });
      }
    }

    const timeline = Array.from(timelineMap.values())
      .sort((a, b) => {
        if ((a.stepOrder || 0) !== (b.stepOrder || 0)) {
          return (a.stepOrder || 0) - (b.stepOrder || 0);
        }

        return getTimelineTimestamp(a) - getTimelineTimestamp(b);
      })
      .map((item, index) => ({
        ...item,
        scheduleId: item.scheduleId || `${contactId}-${item.stepIndex}-${index}`
      }));

    return {
      contactId,
      contactName: schedules[0]?.contact?.name || 'Sem nome',
      contactNumber: schedules[0]?.contact?.number || '',
      contactProfilePicUrl: schedules[0]?.contact?.profilePicUrl || null,
      floupName: floup.name,
      totalSteps: steps.length,
      timeline
    };
  }


  static async togglePauseSchedule(scheduleId: number, companyId: number): Promise<{ status: string } | null> {
    logger.info(`[FLOUP] service.togglePauseSchedule → scheduleId=${scheduleId}, companyId=${companyId}`);
    const schedule = await FloupSchedule.findOne({
      where: { id: scheduleId, companyId }
    });
    if (!schedule) return null;
    
    if (schedule.status === 'PENDING') {
      schedule.status = 'PAUSED';
      await schedule.save();
      logger.info(`[FLOUP] togglePauseSchedule ✓ scheduleId=${scheduleId} → PAUSED`);
      return { status: 'PAUSED' };
    } else if (schedule.status === 'PAUSED') {
      schedule.status = 'PENDING';
      await schedule.save();
      logger.info(`[FLOUP] togglePauseSchedule ✓ scheduleId=${scheduleId} → PENDING`);
      return { status: 'PENDING' };
    }
    
    logger.warn(`[FLOUP] togglePauseSchedule → Schedule ${scheduleId} has status ${schedule.status}, cannot toggle`);
    return null;
  }

  // Parar floup para um contato
  static async pararFloupParaContato(floupId: number, companyId: number, contactId: number): Promise<boolean> {
    logger.info(`[FLOUP] service.pararFloupParaContato → floupId=${floupId}, contactId=${contactId}, companyId=${companyId}`);
    
    // Buscar TODOS os schedules (não apenas pendentes) para ter visibilidade completa
    const todosSchedules = await FloupSchedule.findAll({ 
      where: { floupId, contactId, companyId },
      attributes: ['id', 'status']
    });
    
    logger.info(`[FLOUP] service.pararFloupParaContato → Encontrados ${todosSchedules.length} schedules totais`);
    
    // Buscar schedules pendentes para cancelar
    const pendentes = todosSchedules.filter(s => s.status === 'PENDING');
    
    logger.info(`[FLOUP] service.pararFloupParaContato → Encontrados ${pendentes.length} schedules pendentes`);
    
    if (pendentes.length > 0) {
      // Se há schedules pendentes, cancelar TODOS eles de forma explícita
      const idsPendentes = pendentes.map(s => s.id);
      logger.info(`[FLOUP] service.pararFloupParaContato → Cancelando schedules com IDs: ${idsPendentes.join(', ')}`);
      
      const resultado = await FloupSchedule.update(
        { status: 'CANCELLED' }, 
        { where: { id: { [require('sequelize').Op.in]: idsPendentes } } }
      );
      
      logger.info(`[FLOUP] service.pararFloupParaContato → Update retornou: ${JSON.stringify(resultado)}`);
      
      // Verificar se realmente foram cancelados
      const pendentesAposUpdate = await FloupSchedule.findAll({ 
        where: { id: { [require('sequelize').Op.in]: idsPendentes }, status: 'PENDING' },
        attributes: ['id', 'status', 'floupId', 'contactId', 'companyId']
      });
      
      if (pendentesAposUpdate.length > 0) {
        logger.error(`[FLOUP] service.pararFloupParaContato → ERRO: Ainda há ${pendentesAposUpdate.length} schedules pendentes após update! IDs: ${pendentesAposUpdate.map(s => s.id).join(', ')}`);
        // Tentar novamente com where mais específico usando os IDs
        const idsParaForcar = pendentesAposUpdate.map(s => s.id);
        const resultadoForcado = await FloupSchedule.update(
          { status: 'CANCELLED' }, 
          { where: { id: { [require('sequelize').Op.in]: idsParaForcar } } }
        );
        logger.info(`[FLOUP] service.pararFloupParaContato → Cancelamento forçado: ${resultadoForcado[0]} schedules atualizados`);
        
        // Verificar uma última vez
        const pendentesAposForcar = await FloupSchedule.findAll({ 
          where: { id: { [require('sequelize').Op.in]: idsParaForcar }, status: 'PENDING' },
          attributes: ['id', 'status']
        });
        if (pendentesAposForcar.length > 0) {
          logger.error(`[FLOUP] service.pararFloupParaContato → ERRO CRÍTICO: Ainda há ${pendentesAposForcar.length} schedules pendentes após cancelamento forçado!`);
        }
      }
      
      try { 
        const io = getIO(); 
        io.of(String(companyId)).emit(`company-${companyId}-floup-stopped`, { 
          action: 'stop', 
          contactId, 
          floupId, 
          cancelledSchedules: pendentes.length 
        }); 
      } catch (err) {
        logger.error(`[FLOUP] service.pararFloupParaContato → Erro ao emitir socket event:`, err);
      }
      
      logger.info(`[FLOUP] service.pararFloupParaContato ✓ cancelled=${pendentes.length}`);
      return true;
    }
    
    // Verificar se existe algum schedule do floup para este contato (mesmo que já concluído)
    if (todosSchedules.length > 0) {
      // Se existe schedule mas não está pendente, significa que já foi concluído ou cancelado
      const statusCounts = todosSchedules.reduce((acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {} as any);
      logger.info(`[FLOUP] service.pararFloupParaContato → Floup já foi processado. Status: ${JSON.stringify(statusCounts)}`);
      // Retornar true mesmo assim, pois tecnicamente o floup não está mais ativo
      return true;
    }
    
    // Se não encontrou nenhum schedule, retornar false
    logger.warn(`[FLOUP] service.pararFloupParaContato → Nenhum schedule encontrado para floupId=${floupId}, contactId=${contactId}`);
    return false;
  }

  // Verificar e cancelar Floups quando contato envia mensagem
  static async verificarECancelarFloupsAoReceberMensagem(ticketId: number, contactId: number, companyId: number, messageBody?: string): Promise<void> {
    try {
      if (!contactId) return;
      
      logger.info(`[FLOUP] verificarECancelarFloupsAoReceberMensagem → ticketId=${ticketId}, contactId=${contactId}, companyId=${companyId}`);
      
      // Buscar todos os Floups ativos para este contato
      const schedulesAtivos = await FloupSchedule.findAll({
        where: { 
          contactId, 
          companyId, 
          status: 'PENDING' 
        },
        include: [
          {
            model: Floup,
            as: 'floup',
            attributes: ['id', 'name', 'stopConditions']
          }
        ]
      });
      
      if (schedulesAtivos.length === 0) {
        logger.info(`[FLOUP] verificarECancelarFloupsAoReceberMensagem → Nenhum Floup ativo para contato ${contactId}`);
        return;
      }
      
      logger.info(`[FLOUP] verificarECancelarFloupsAoReceberMensagem → Encontrados ${schedulesAtivos.length} Floups ativos`);
      
      // Para cada Floup ativo, verificar condições de parada
      for (const schedule of schedulesAtivos) {
        const floup = schedule.floup;
        if (!floup || !floup.stopConditions || floup.stopConditions.length === 0) {
          continue;
        }
        
        const stopConditions = floup.stopConditions || [];
        let shouldCancel = false;
        
        for (const condition of stopConditions) {
          if (!condition.enabled) continue;
          
          // 1. Caso o Contato responder qualquer mensagem
          if (condition.type === 'anyMessage') {
            logger.info(`[FLOUP] verificarECancelarFloupsAoReceberMensagem → Condição 'anyMessage' ativa para Floup ${floup.id}`);
            shouldCancel = true;
            break;
          }
          
          // 2. Caso o Contato responder uma Palavra chave
          if (condition.type === 'keyword' && condition.keyword && messageBody) {
            const keyword = condition.keyword.trim().toLowerCase();
            const body = messageBody.toLowerCase();
            if (keyword && body.includes(keyword)) {
              logger.info(`[FLOUP] verificarECancelarFloupsAoReceberMensagem → Condição 'keyword' (${keyword}) atendida para Floup ${floup.id}`);
              shouldCancel = true;
              break;
            }
          }
          
          // 3. Caso o Ticket for Fechado - verificar status do ticket
          if (condition.type === 'ticketClosed') {
            const Ticket = (await import('../../models/Ticket')).default;
            const ticket = await Ticket.findByPk(ticketId);
            if (ticket && ticket.status === 'closed') {
              logger.info(`[FLOUP] verificarECancelarFloupsAoReceberMensagem → Condição 'ticketClosed' atendida para Floup ${floup.id}`);
              shouldCancel = true;
              break;
            }
          }
        }
        
        if (shouldCancel) {
          // Cancelar todos os schedules pendentes deste Floup para este contato
          const cancelled = await FloupSchedule.update(
            { status: 'CANCELLED' }, 
            { 
              where: { 
                floupId: floup.id, 
                contactId, 
                companyId, 
                status: 'PENDING' 
              } 
            }
          );
          
          logger.info(`[FLOUP] verificarECancelarFloupsAoReceberMensagem → Floup ${floup.id} cancelado para contato ${contactId}. Schedules cancelados: ${cancelled[0]}`);
          
          try {
            const io = getIO();
            io.of(String(companyId)).emit(`company-${companyId}-floup-stopped`, { 
              action: 'stop', 
              contactId, 
              floupId: floup.id, 
              reason: 'stop_condition_met',
              cancelledSchedules: cancelled[0] 
            });
          } catch (ioError) {
            // Ignorar erros de socket
          }
        }
      }
    } catch (error) {
      logger.error(`[FLOUP] verificarECancelarFloupsAoReceberMensagem → Erro:`, error);
    }
  }

  // Verificar e iniciar Floups quando tag é adicionada ao contato
  static async verificarEIniciarFloupsAoAdicionarTag(contactId: number, companyId: number, tagName: string): Promise<void> {
    try {
      if (!contactId || !tagName) {
        logger.warn(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → Parâmetros inválidos: contactId=${contactId}, tagName=${tagName}`);
        return;
      }
      
      logger.info(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → contactId=${contactId}, tagName="${tagName}", companyId=${companyId}`);
      
      // Buscar todos os Floups ativos da empresa
      const floupsAtivos = await safeFloupQuery<Floup[]>(
        () => Floup.findAll({
          where: { 
            companyId, 
            isActive: true 
          }
        }),
        () => Floup.findAll({
          where: { 
            companyId, 
            isActive: true 
          },
          attributes: { exclude: ['condition', 'conditionValue'] }
        })
      );
      
      if (floupsAtivos.length === 0) {
        logger.info(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → Nenhum Floup ativo encontrado para companyId=${companyId}`);
        return;
      }
      
      logger.info(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → Encontrados ${floupsAtivos.length} Floups ativos`);
      
      // Verificar se o contato já tem algum Floup ativo
      const floupAtivoExistente = await FloupSchedule.findOne({
        where: { 
          contactId, 
          companyId, 
          status: 'PENDING' 
        }
      });
      
      if (floupAtivoExistente) {
        logger.info(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → Contato ${contactId} já possui Floup ativo (floupId=${floupAtivoExistente.floupId}, scheduleId=${floupAtivoExistente.id})`);
        return;
      }
      
      // Para cada Floup, verificar se a condição de ativação é "tag" e se corresponde à tag adicionada
      for (const floup of floupsAtivos) {
        // Verificar se o Floup tem passos (necessário para executar)
        if (!floup.steps || floup.steps.length === 0) {
          logger.debug(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → Floup ${floup.id} não possui passos`);
          continue;
        }
        
        // Log detalhado da condição do Floup para debug
        logger.info(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → Floup ${floup.id} (${floup.name}) - Condição: condition="${floup.condition}", conditionValue="${floup.conditionValue}", tagName procurada="${tagName}"`);
        
        // Verificar se a condição do Floup é "tag" e se corresponde à tag adicionada
        // Comparação case-insensitive e removendo espaços extras
        const conditionMatches = floup.condition === 'tag';
        const tagNameNormalized = (tagName || '').trim().toLowerCase();
        const conditionValueNormalized = (floup.conditionValue || '').trim().toLowerCase();
        const valueMatches = conditionValueNormalized === tagNameNormalized;
        
        logger.info(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → Floup ${floup.id} - conditionMatches=${conditionMatches}, valueMatches=${valueMatches} (comparando "${conditionValueNormalized}" com "${tagNameNormalized}")`);
        
        if (conditionMatches && valueMatches) {
          logger.info(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → ✓ Floup ${floup.id} (${floup.name}) corresponde à tag "${tagName}", iniciando...`);
          
          // Buscar ticket mais recente do contato ou criar um novo se necessário
          const Ticket = (await import('../../models/Ticket')).default;
          let ticket = await Ticket.findOne({
            where: { contactId, companyId },
            order: [['updatedAt', 'DESC']]
          });
          
          // Se não tem ticket, não podemos iniciar o Floup (precisa de ticket para enviar mensagens)
          if (!ticket) {
            logger.warn(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → Contato ${contactId} não possui ticket, não é possível iniciar Floup ${floup.id}`);
            continue;
          }
          
          logger.info(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → Ticket encontrado: ticketId=${ticket.id}, channel=${ticket.channel}`);
          
          // Iniciar o Floup para o contato
          try {
            await this.atrelarFloupAContato(floup.id, companyId, contactId, ticket.id);
            logger.info(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → ✓✓✓ Floup ${floup.id} (${floup.name}) iniciado com sucesso para contato ${contactId}, ticket ${ticket.id}`);
          } catch (error) {
            logger.error(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → Erro ao iniciar Floup ${floup.id}:`, error);
          }
        } else {
          logger.debug(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → Floup ${floup.id} não corresponde: condition=${floup.condition}, conditionValue="${floup.conditionValue}"`);
        }
      }
    } catch (error) {
      logger.error(`[FLOUP] verificarEIniciarFloupsAoAdicionarTag → Erro geral:`, error);
    }
  }

  /**
   * Verifica e inicia Floups cuja condição de ativação é uma interação
   * (firstClientInteraction ou firstAttendantInteraction).
   * Disparado quando o contato/atendente envia sua primeira mensagem no ticket.
   */
  static async verificarEIniciarFloupsPorInteracao(
    contactId: number,
    companyId: number,
    ticketId: number,
    conditionType: 'firstClientInteraction' | 'firstAttendantInteraction'
  ): Promise<void> {
    try {
      if (!contactId || !ticketId || !conditionType) {
        return;
      }

      logger.info(`[FLOUP] verificarEIniciarFloupsPorInteracao → contactId=${contactId}, ticketId=${ticketId}, type=${conditionType}, companyId=${companyId}`);

      const floupsAtivos = await safeFloupQuery<Floup[]>(
        () => Floup.findAll({ where: { companyId, isActive: true } }),
        () => Floup.findAll({
          where: { companyId, isActive: true },
          attributes: { exclude: ['condition', 'conditionValue'] }
        })
      );

      if (!floupsAtivos.length) return;

      // Não iniciar se o contato já tem um Floup ativo
      const floupAtivoExistente = await FloupSchedule.findOne({
        where: { contactId, companyId, status: 'PENDING' }
      });
      if (floupAtivoExistente) {
        logger.info(`[FLOUP] verificarEIniciarFloupsPorInteracao → Contato ${contactId} já possui Floup ativo (scheduleId=${floupAtivoExistente.id})`);
        return;
      }

      for (const floup of floupsAtivos) {
        if (!floup.steps || floup.steps.length === 0) continue;
        if ((floup as any).condition !== conditionType) continue;

        logger.info(`[FLOUP] verificarEIniciarFloupsPorInteracao → ✓ Floup ${floup.id} (${floup.name}) corresponde à condição ${conditionType}, iniciando...`);

        try {
          await this.atrelarFloupAContato(floup.id, companyId, contactId, ticketId);
          logger.info(`[FLOUP] verificarEIniciarFloupsPorInteracao → ✓✓✓ Floup ${floup.id} iniciado para contato ${contactId}, ticket ${ticketId}`);
        } catch (error) {
          logger.error(`[FLOUP] verificarEIniciarFloupsPorInteracao → Erro ao iniciar Floup ${floup.id}:`, error);
        }
      }
    } catch (error) {
      logger.error(`[FLOUP] verificarEIniciarFloupsPorInteracao → Erro geral:`, error);
    }
  }



  // Obter floup ativo de um contato
  static async obterFloupAtivoDoContato(contactId: number, companyId: number) {
    logger.debug(`[FLOUP] service.obterFloupAtivoDoContato → contactId=${contactId}, companyId=${companyId}`);
    
    // Buscar todos os schedules do contato para debug
    const todosSchedulesDoContato = await FloupSchedule.findAll({
      where: { contactId, companyId },
      attributes: ['id', 'status', 'floupId', 'currentStepIndex', 'nextRunAt']
    });
    logger.debug(`[FLOUP] service.obterFloupAtivoDoContato → Total de schedules do contato: ${todosSchedulesDoContato.length}, PENDING: ${todosSchedulesDoContato.filter(s => s.status === 'PENDING').length}`);
    
    const agendamentoAtivo = await FloupSchedule.findOne({
      where: { contactId, companyId, status: 'PENDING' },
      include: [{ model: Floup, as: 'floup', attributes: ['id', 'name', 'description', 'templateType', 'steps', 'stopConditions', 'pauseConditions'] }],
      order: [['nextRunAt', 'ASC']]
    });
    
    if (!agendamentoAtivo) {
      logger.debug(`[FLOUP] service.obterFloupAtivoDoContato → Nenhum schedule PENDING encontrado`);
      return null;
    }
    
    logger.debug(`[FLOUP] service.obterFloupAtivoDoContato → Schedule PENDING encontrado: id=${agendamentoAtivo.id}, floupId=${agendamentoAtivo.floupId}, nextRunAt=${agendamentoAtivo.nextRunAt?.toISOString()}`);
    const todosAgendamentos = await FloupSchedule.findAll({ where: { contactId, companyId, status: 'PENDING' }, order: [['nextRunAt', 'ASC']] });
    
    // Buscar todos os schedules do Floup (incluindo completados) para rastrear execuções
    const { Op } = require('sequelize');
    const todosSchedules = await FloupSchedule.findAll({
      where: {
        contactId,
        companyId,
        floupId: agendamentoAtivo.floupId,
        status: { [Op.in]: ['PENDING', 'COMPLETED'] }
      },
      order: [['createdAt', 'ASC']],
      attributes: ['id', 'currentStepIndex', 'status', 'updatedAt', 'createdAt', 'nextRunAt']
    });
    
    // Mapear quais passos foram executados e quando
    // Um passo foi executado se currentStepIndex > índice do passo
    const executedSteps = {};
    const currentIndex = agendamentoAtivo.currentStepIndex;
    
    // Para obter a data de execução correta, vamos buscar as mensagens enviadas pelo Floup
    // Cada passo executado cria uma mensagem, e podemos usar o createdAt da mensagem como data de execução
    const Message = (await import('../../models/Message')).default;
    const ticketId = agendamentoAtivo.ticketId;
    
    if (ticketId && agendamentoAtivo.floup.steps) {
      // Buscar mensagens enviadas pelo sistema (fromMe = true) neste ticket
      // que correspondem aos passos do Floup
      const messages = await Message.findAll({
        where: {
          ticketId,
          fromMe: true
        },
        order: [['createdAt', 'ASC']],
        attributes: ['id', 'body', 'createdAt', 'mediaType']
      });
      
      // Para cada passo executado, tentar encontrar a mensagem correspondente
      // Vamos usar uma abordagem mais robusta: buscar mensagens em ordem cronológica
      // e tentar correspondê-las aos passos pela ordem e conteúdo
      const usedMessageIds = new Set();
      
      for (let i = 0; i < currentIndex && i < agendamentoAtivo.floup.steps.length; i++) {
        const step = agendamentoAtivo.floup.steps[i];
        const stepMessage = (step.message || '').trim();
        
        // Procurar mensagem que corresponde ao passo
        // Primeiro, tentar encontrar por correspondência exata ou parcial do texto
        let matchingMessage = messages.find(msg => {
          if (usedMessageIds.has(msg.id)) return false; // Já foi usado para outro passo
          const msgBody = (msg.body || '').trim();
          if (!msgBody && !stepMessage) return true; // Ambos vazios
          if (!msgBody || !stepMessage) return false;
          
          // Verificar correspondência: mensagem contém texto do passo ou vice-versa
          const stepStart = stepMessage.substring(0, Math.min(30, stepMessage.length));
          const msgStart = msgBody.substring(0, Math.min(30, msgBody.length));
          
          return msgBody.includes(stepStart) || 
                 stepMessage.includes(msgStart) ||
                 msgBody === stepMessage ||
                 (stepStart.length > 10 && msgStart.length > 10 && 
                  msgStart.toLowerCase() === stepStart.toLowerCase());
        });
        
        // Se não encontrou por conteúdo, usar a mensagem mais recente não usada
        // que foi enviada após o início do Floup
        if (!matchingMessage && messages.length > 0) {
          const floupStartTime = agendamentoAtivo.createdAt;
          const availableMessages = messages.filter(msg => 
            !usedMessageIds.has(msg.id) && 
            new Date(msg.createdAt) >= new Date(floupStartTime)
          );
          
          if (availableMessages.length > i) {
            // Usar a i-ésima mensagem disponível (assumindo ordem de execução)
            matchingMessage = availableMessages[i];
          }
        }
        
        if (matchingMessage) {
          // Usar o createdAt da mensagem como data de execução exata
          usedMessageIds.add(matchingMessage.id);
          executedSteps[i] = {
            executedAt: matchingMessage.createdAt,
            scheduleId: agendamentoAtivo.id,
            messageId: matchingMessage.id
          };
        } else {
          // Se não encontrou mensagem correspondente, usar fallback
          // Procurar schedule que foi atualizado após a execução deste passo
          const scheduleForNextStep = todosSchedules.find(s => s.currentStepIndex === i + 1);
          if (scheduleForNextStep) {
            executedSteps[i] = {
              executedAt: scheduleForNextStep.updatedAt,
              scheduleId: scheduleForNextStep.id
            };
          } else {
            executedSteps[i] = {
              executedAt: agendamentoAtivo.updatedAt,
              scheduleId: agendamentoAtivo.id
            };
          }
        }
      }
    } else {
      // Fallback: se não tem ticketId, usar updatedAt dos schedules
      const schedulesSorted = [...todosSchedules].sort((a, b) => 
        new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      );
      
      for (let i = 0; i < currentIndex; i++) {
        const scheduleAfterExecution = schedulesSorted.find(s => s.currentStepIndex === i + 1);
        if (scheduleAfterExecution) {
          executedSteps[i] = {
            executedAt: scheduleAfterExecution.updatedAt,
            scheduleId: scheduleAfterExecution.id
          };
        } else {
          executedSteps[i] = {
            executedAt: agendamentoAtivo.updatedAt,
            scheduleId: agendamentoAtivo.id
          };
        }
      }
    }
    
    // Se há schedules completados, todos os passos foram executados
    const completedSchedules = todosSchedules.filter(s => s.status === 'COMPLETED');
    if (completedSchedules.length > 0 && agendamentoAtivo.floup.steps) {
      const lastCompleted = completedSchedules[completedSchedules.length - 1];
      for (let i = 0; i < agendamentoAtivo.floup.steps.length; i++) {
        if (!executedSteps[i]) {
          executedSteps[i] = {
            executedAt: lastCompleted.updatedAt,
            scheduleId: lastCompleted.id
          };
        }
      }
    }
    
    logger.debug(`[FLOUP] service.obterFloupAtivoDoContato ✓ nextAt=${agendamentoAtivo.nextRunAt?.toISOString?.()}, executedSteps=${Object.keys(executedSteps).length}`);
    return { 
      ...agendamentoAtivo.floup.toJSON(), 
      activeSchedule: {
        id: agendamentoAtivo.id,
        currentStepIndex: agendamentoAtivo.currentStepIndex,
        stepOrder: agendamentoAtivo.stepOrder,
        nextRunAt: agendamentoAtivo.nextRunAt,
        status: agendamentoAtivo.status,
        createdAt: agendamentoAtivo.createdAt,
        updatedAt: agendamentoAtivo.updatedAt
      }, 
      totalPendingSteps: todosAgendamentos.length, 
      nextStepAt: agendamentoAtivo.nextRunAt,
      executedSteps // Informações sobre passos executados
    };
  }
}


