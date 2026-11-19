import { redisClient } from "./redisClient";
import logger from "../utils/logger";

/**
 * Presença dos ramais compartilhada entre processos.
 *
 * POR QUE ISTO EXISTE
 *
 * A presença era lida das salas do Socket.IO (`adapter.rooms`). Isso é exato,
 * mas só enxerga o que está conectado NESTE processo Node. Quando o backend
 * roda em mais de um processo — PM2 em modo cluster, várias instâncias atrás
 * de um balanceador — cada processo vê apenas uma fatia dos usuários.
 *
 * O efeito é exatamente o relatado: o mesmo atendente, logado o tempo todo,
 * aparece online quando o pedido cai no processo em que ele está conectado e
 * some quando cai em outro. É o "às vezes aparece o ramal, às vezes não".
 *
 * A solução é registrar a presença num lugar que todos os processos enxergam.
 * O Redis já é dependência do projeto (filas e cache), então não há peça nova
 * na infraestrutura.
 *
 * COMO FUNCIONA
 *
 * Cada conexão grava uma chave com validade curta e a renova enquanto viver.
 * Se o processo morrer, a chave expira sozinha — nada de presença fantasma
 * como acontecia com o campo `online` no banco, que dependia da desconexão
 * ser registrada direito.
 */

const VALIDADE_SEGUNDOS = 90;

const chave = (companyId: number, userId: number) =>
  `presenca:ramal:${companyId}:${userId}`;

/** Marca (ou renova) o usuário como presente. */
export const marcarPresente = async (
  companyId: number,
  userId: number
): Promise<void> => {
  if (!companyId || !userId) return;
  try {
    await redisClient.set(chave(companyId, userId), "1", "EX", VALIDADE_SEGUNDOS);
  } catch (err: any) {
    // Presença é um enfeite da lista: se o Redis estiver fora, a tela cai no
    // que o processo local enxerga em vez de quebrar.
    logger.warn(`[RAMAL] não consegui marcar presença: ${err?.message}`);
  }
};

/**
 * Remove a marca de presença.
 *
 * Chamado na desconexão. Não é essencial — a chave expiraria sozinha — mas
 * evita que o ramal fique aparecendo online por mais um minuto e meio depois
 * que a pessoa fechou o sistema.
 */
export const marcarAusente = async (
  companyId: number,
  userId: number
): Promise<void> => {
  if (!companyId || !userId) return;
  try {
    await redisClient.del(chave(companyId, userId));
  } catch (err: any) {
    logger.warn(`[RAMAL] não consegui limpar presença: ${err?.message}`);
  }
};

/**
 * Quem está presente entre os ids informados.
 *
 * Consulta só os ids que interessam (os usuários com ramal da empresa), em vez
 * de varrer o Redis com KEYS — que trava o servidor em bases grandes.
 */
export const presentesEntre = async (
  companyId: number,
  userIds: number[]
): Promise<Set<number>> => {
  const presentes = new Set<number>();
  if (!companyId || !userIds.length) return presentes;

  try {
    const valores = await redisClient.mget(
      ...userIds.map(id => chave(companyId, id))
    );
    userIds.forEach((id, i) => {
      if (valores[i]) presentes.add(Number(id));
    });
  } catch (err: any) {
    logger.warn(`[RAMAL] não consegui ler presença: ${err?.message}`);
  }
  return presentes;
};

export default { marcarPresente, marcarAusente, presentesEntre };
