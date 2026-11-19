import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import { scheduleCache } from "../../utils/SimpleObjectCache";

type Result = {
  id: number;
  currentSchedule: [];
  startTimeA: string;
  endTimeA: string;
  startTimeB: string;
  endTimeB: string;
  inActivity: boolean;
};

/**
 * Gera chave de cache baseada no minuto atual (invalida automaticamente a cada minuto).
 */
const getCacheKey = (companyId: number, queueId: number, whatsappId: number): string => {
  const minuteSlot = Math.floor(Date.now() / 60000);
  return `schedule:${companyId}:${queueId}:${whatsappId}:${minuteSlot}`;
};

/**
 * FUSO HORÁRIO POR NÍVEL
 *
 * Antes a avaliação usava now() do servidor (fuso do banco) nas três queries,
 * o que quebrava clientes fora do Brasil: um servidor em horário de São Paulo
 * atendendo uma empresa na Espanha abria/fechava expediente 4-5h errado.
 *
 * Agora cada nível (empresa / conexão / fila) tem sua coluna timezone, e o
 * "agora" é convertido para esse fuso ANTES de comparar com o schedule:
 *   (now() AT TIME ZONE <coluna_timezone>)
 * A coluna vem da MESMA tabela que a query já lê, então a assinatura não muda e
 * nenhum caller precisa ser alterado. NULLIF+COALESCE cobrem linhas sem fuso.
 * O dia da semana também sai do horário no fuso do nível (evita erro perto da
 * meia-noite).
 */
const VerifyCurrentSchedule = async (companyId?: number, queueId?: number, whatsappId?: number): Promise<Result> => {
  const cacheKey = getCacheKey(companyId || 0, queueId || 0, whatsappId || 0);

  return scheduleCache.getOrFetch(cacheKey, async () => {
    // @ts-ignore: Unreachable code error
  if (Number(whatsappId) > 0 && Number(queueId === 0)) {
    const sql = `
        select
        s.id,
        s.currentWeekday,
        s.currentSchedule,
          (s.currentSchedule->>'startTimeA') "startTimeA",
          (s.currentSchedule->>'endTimeA') "endTimeA",
          (s.currentSchedule->>'startTimeB') "startTimeB",
          (s.currentSchedule->>'endTimeB') "endTimeB",
          ( (
            case when s.currentSchedule->>'startTimeA' = '' then s.localnow >= '00:00'::time
    			ELSE s.localnow >= (s.currentSchedule->>'startTimeA')::time end
 			) and (
            case when s.currentSchedule->>'endTimeA' = ''then s.localnow <= '00:00'::time
    			ELSE s.localnow <= (s.currentSchedule->>'endTimeA')::time end ) ) or ( (
            case when s.currentSchedule->>'startTimeB' = ''then s.localnow >= '00:00'::time
    			ELSE s.localnow >= (s.currentSchedule->>'startTimeB')::time end
 			) and (
            case when s.currentSchedule->>'endTimeB' = ''then s.localnow <= '00:00'::time
    			ELSE s.localnow <= (s.currentSchedule->>'endTimeB')::time end
          )) "inActivity"
      from (
        SELECT
              c.id,
              to_char((now() AT TIME ZONE COALESCE(NULLIF(c.timezone, ''), 'America/Sao_Paulo')), 'day') currentWeekday,
              (now() AT TIME ZONE COALESCE(NULLIF(c.timezone, ''), 'America/Sao_Paulo'))::time localnow,
              (array_to_json(array_agg(s))->>0)::jsonb currentSchedule
        FROM "Whatsapps" c, jsonb_array_elements(c.schedules) s
        WHERE s->>'weekdayEn' like trim(to_char((now() AT TIME ZONE COALESCE(NULLIF(c.timezone, ''), 'America/Sao_Paulo')), 'day')) and c.id = :whatsappId
        and c."companyId" = :companyId
        GROUP BY 1, 2, 3
      ) s
    `;
    const result: Result = await sequelize.query(sql, {
      replacements: { whatsappId, companyId },
      type: QueryTypes.SELECT,
      plain: true
    });
    return result;
  }
    // @ts-ignore: Unreachable code error
  else if (Number(queueId) === 0 && Number(whatsappId) === 0) {
    const sql = `
        select
        s.id,
        s.currentWeekday,
        s.currentSchedule,
          (s.currentSchedule->>'startTimeA') "startTimeA",
          (s.currentSchedule->>'endTimeA') "endTimeA",
          (s.currentSchedule->>'startTimeB') "startTimeB",
          (s.currentSchedule->>'endTimeB') "endTimeB",
          ( (
            case when s.currentSchedule->>'startTimeA' = '' then s.localnow >= '00:00'::time
    			ELSE s.localnow >= (s.currentSchedule->>'startTimeA')::time end
 			) and (
            case when s.currentSchedule->>'endTimeA' = ''then s.localnow <= '00:00'::time
    			ELSE s.localnow <= (s.currentSchedule->>'endTimeA')::time end ) ) or ( (
            case when s.currentSchedule->>'startTimeB' = ''then s.localnow >= '00:00'::time
    			ELSE s.localnow >= (s.currentSchedule->>'startTimeB')::time end
 			) and (
            case when s.currentSchedule->>'endTimeB' = ''then s.localnow <= '00:00'::time
    			ELSE s.localnow <= (s.currentSchedule->>'endTimeB')::time end
          )) "inActivity"
      from (
        SELECT
              c.id,
              to_char((now() AT TIME ZONE COALESCE(NULLIF(c.timezone, ''), 'America/Sao_Paulo')), 'day') currentWeekday,
              (now() AT TIME ZONE COALESCE(NULLIF(c.timezone, ''), 'America/Sao_Paulo'))::time localnow,
              (array_to_json(array_agg(s))->>0)::jsonb currentSchedule
        FROM "Companies" c, jsonb_array_elements(c.schedules) s
        WHERE s->>'weekdayEn' like trim(to_char((now() AT TIME ZONE COALESCE(NULLIF(c.timezone, ''), 'America/Sao_Paulo')), 'day')) and c.id = :companyId
        GROUP BY 1, 2, 3
      ) s
    `;
    const result: Result = await sequelize.query(sql, {
      replacements: { companyId },
      type: QueryTypes.SELECT,
      plain: true
    });
    return result;
  } else {
    const sql = `
      select
        s.id,
        s.currentWeekday,
        s.currentSchedule,
          (s.currentSchedule->>'startTimeA') "startTimeA",
          (s.currentSchedule->>'endTimeA') "endTimeA",
          (s.currentSchedule->>'startTimeB') "startTimeB",
          (s.currentSchedule->>'endTimeB') "endTimeB",
          COALESCE(( (
            case when s.currentSchedule->>'startTimeA' = '' then s.localnow >= '00:00'::time
    			ELSE s.localnow >= (s.currentSchedule->>'startTimeA')::time end
 			) and (
            case when s.currentSchedule->>'endTimeA' = ''then s.localnow <= '00:00'::time
    			ELSE s.localnow <= (s.currentSchedule->>'endTimeA')::time end ) ) or ( (
            case when s.currentSchedule->>'startTimeB' = ''then s.localnow >= '00:00'::time
    			ELSE s.localnow >= (s.currentSchedule->>'startTimeB')::time end
 			) and (
            case when s.currentSchedule->>'endTimeB' = ''then s.localnow <= '00:00'::time
    			ELSE s.localnow <= (s.currentSchedule->>'endTimeB')::time end
          )),false)  "inActivity"
      from (
        SELECT
              q.id,
              to_char((now() AT TIME ZONE COALESCE(NULLIF(q.timezone, ''), 'America/Sao_Paulo')), 'day') currentWeekday,
              (now() AT TIME ZONE COALESCE(NULLIF(q.timezone, ''), 'America/Sao_Paulo'))::time localnow,
              (array_to_json(array_agg(s))->>0)::jsonb currentSchedule
        FROM "Queues" q, jsonb_array_elements(q.schedules) s
        WHERE s->>'weekdayEn' like trim(to_char((now() AT TIME ZONE COALESCE(NULLIF(q.timezone, ''), 'America/Sao_Paulo')), 'day')) and q.id = :queueId
        and q."companyId" = :companyId
        GROUP BY 1, 2, 3
      ) s
    `;
    const result: Result = await sequelize.query(sql, {
      replacements: { queueId, companyId },
      type: QueryTypes.SELECT,
      plain: true
    });
    return result;
  }
  }, 60);
};

export default VerifyCurrentSchedule;
