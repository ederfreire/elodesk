import { Op } from "sequelize";
import User from "../models/User";
import { presentesEntre } from "./presencaRamais";
import logger from "../utils/logger";

/**
 * Ligações internas entre atendentes (ramal a ramal).
 *
 * O áudio/vídeo vai DIRETO de um navegador pro outro (WebRTC). O servidor
 * não transporta mídia — ele só faz o "aperto de mão": leva a oferta de um
 * lado, a resposta do outro, e os candidatos de rede (ICE) entre os dois.
 * Por isso não há PABX, troncal, nem servidor de mídia envolvido, e o custo
 * no servidor é praticamente zero.
 *
 * O transporte já existe: cada socket entra na sala `user-{id}` ao conectar
 * (ver socket.ts), então mandar um evento pra um atendente específico é só
 * emitir naquela sala.
 */

// Quem está em ligação interna agora: userId -> { callId, peerId, desde }.
// Serve pra mostrar "ocupado" na lista de ramais e pra recusar uma segunda
// chamada automaticamente, em vez de tocar duas vezes na mesma pessoa.
type BusyEntry = { callId: string; peerId: number; since: number };
const busy = new Map<number, BusyEntry>();

// Limpeza de segurança: se um navegador fechar no meio da ligação sem
// avisar, a entrada ficaria presa e a pessoa apareceria "ocupada" pra
// sempre. Qualquer registro com mais de 4 horas é descartado.
const MAX_CALL_AGE_MS = 4 * 60 * 60 * 1000;

const pruneStale = (): void => {
  const limite = Date.now() - MAX_CALL_AGE_MS;
  for (const [userId, entry] of busy) {
    if (entry.since < limite) busy.delete(userId);
  }
};

export const isBusy = (userId: number): boolean => {
  pruneStale();
  return busy.has(Number(userId));
};

export const setBusy = (userId: number, callId: string, peerId: number): void => {
  busy.set(Number(userId), { callId, peerId, since: Date.now() });
};

export const clearBusy = (userId: number): void => {
  busy.delete(Number(userId));
};

export const busyUserIds = (): number[] => {
  pruneStale();
  return Array.from(busy.keys());
};

/**
 * Lista os ramais da empresa com a situação de cada um.
 * `online` vem do próprio registro do usuário (mantido pelo heartbeat do
 * socket); `emLigacao` vem do mapa acima.
 */
/**
 * @param onlineIds  ids de usuário com socket ABERTO neste momento.
 *
 * Por que não usar o campo User.online: ele é gravado no banco em cada
 * conexão/desconexão, e basta uma queda de rede, uma aba fechada à força ou
 * um restart do backend pra ele ficar mentindo — atendente logado aparecendo
 * offline, ou o contrário. Já a presença de socket é a verdade do momento:
 * ou existe uma conexão na sala `user-{id}`, ou não existe.
 */
export const listExtensions = async (
  companyId: number,
  exceptUserId?: number,
  onlineIds?: Set<number>
) => {
  const users = await User.findAll({
    where: {
      companyId,
      internalExtension: { [Op.ne]: null } as any
    },
    attributes: ["id", "name", "internalExtension", "online", "profileImage"],
    order: [["internalExtension", "ASC"]]
  });

  const ocupados = new Set(busyUserIds());

  // Presença compartilhada: soma o que ESTE processo enxerga com o que os
  // outros processos registraram no Redis. Só o primeiro não bastava — em
  // PM2 cluster cada processo vê apenas os próprios sockets, e o ramal
  // piscava online/offline conforme o processo que respondia.
  const comRamal = users.map(u => Number(u.id));
  const presentesNoRedis = await presentesEntre(companyId, comRamal);

  const estaOnline = (id: number): boolean => {
    if (onlineIds && onlineIds.has(id)) return true;
    if (presentesNoRedis.has(id)) return true;
    // Sem nenhuma das duas fontes (chamada antiga e Redis fora), cai no
    // campo do banco, que é impreciso mas melhor que dizer que ninguém está.
    if (!onlineIds && presentesNoRedis.size === 0) {
      const u = users.find(x => Number(x.id) === id);
      return !!u?.online;
    }
    return false;
  };

  return users
    .filter(u => String(u.internalExtension || "").trim() !== "")
    .filter(u => (exceptUserId ? Number(u.id) !== Number(exceptUserId) : true))
    .map(u => ({
      userId: u.id,
      name: u.name,
      extension: u.internalExtension,
      profileImage: u.profileImage || null,
      online: estaOnline(Number(u.id)),
      emLigacao: ocupados.has(Number(u.id))
    }));
};

/**
 * Descobre para quem ligar a partir do número do ramal digitado.
 * Restrito à MESMA empresa — um atendente nunca alcança ramal de outra.
 */
export const findUserByExtension = async (
  companyId: number,
  extension: string
): Promise<User | null> => {
  const ramal = String(extension || "").trim();
  if (!ramal) return null;
  try {
    return await User.findOne({
      where: { companyId, internalExtension: ramal },
      attributes: ["id", "name", "internalExtension", "online", "profileImage", "companyId"]
    });
  } catch (err: any) {
    logger.warn(`[RAMAL] Falha ao buscar ramal ${ramal}: ${err?.message}`);
    return null;
  }
};

export default {
  isBusy,
  setBusy,
  clearBusy,
  busyUserIds,
  listExtensions,
  findUserByExtension
};
