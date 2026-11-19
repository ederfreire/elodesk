import logger from "../../utils/logger";

/**
 * Teto de ligações simultâneas POR EMPRESA na campanha de voz.
 *
 * POR QUE EXISTE
 *
 * A fila de voz tem um teto global (VOICE_CAMPAIGN_CONCURRENCY). Sozinho, ele
 * garante que o servidor não afunde — mas não garante justiça: os trabalhos
 * são atendidos por ordem de chegada, então a empresa que enfileirar 2.000
 * contatos primeiro ocupa todas as vagas, e as demais esperam a fila dela
 * acabar. Numa instalação com várias empresas, uma campanha grande deixaria
 * todo mundo parado.
 *
 * Com um teto por empresa, cada uma usa no máximo a sua fatia e sempre sobra
 * vaga para as outras começarem.
 *
 * O contador é de memória, não de banco: ele reflete as ligações em curso
 * NESTE processo, que é exatamente o que o teto precisa controlar. Se o
 * processo reiniciar, as ligações morrem junto e o contador zerado está
 * certo — nada de trava fantasma presa no banco.
 */

const TETO_POR_EMPRESA =
  parseInt(process.env.VOICE_CAMPAIGN_PER_COMPANY || "", 10) || 3;

const emAndamento = new Map<number, number>();

export const tetoPorEmpresa = (): number => TETO_POR_EMPRESA;

export const ligacoesEmAndamento = (companyId: number): number =>
  emAndamento.get(companyId) || 0;

/**
 * Tenta reservar uma vaga. Devolve false quando a empresa já está no teto —
 * quem chamou deve reagendar o contato em vez de ligar agora.
 */
export const reservarVaga = (companyId: number): boolean => {
  const atual = emAndamento.get(companyId) || 0;
  if (atual >= TETO_POR_EMPRESA) return false;
  emAndamento.set(companyId, atual + 1);
  return true;
};

/** Devolve a vaga. Deve rodar sempre, inclusive quando a ligação falha. */
export const liberarVaga = (companyId: number): void => {
  const atual = emAndamento.get(companyId) || 0;
  if (atual <= 1) {
    emAndamento.delete(companyId);
    return;
  }
  emAndamento.set(companyId, atual - 1);
};

/** Foto do uso atual, para diagnóstico. */
export const resumoDeUso = (): string => {
  if (emAndamento.size === 0) return "nenhuma ligação em andamento";
  const partes: string[] = [];
  emAndamento.forEach((qtd, empresa) => partes.push(`empresa ${empresa}: ${qtd}`));
  return partes.join(", ");
};

export const registrarEspera = (companyId: number): void => {
  logger.info(
    `[CAMPANHA-VOZ] Empresa ${companyId} no teto de ${TETO_POR_EMPRESA} ligações simultâneas — contato reagendado. Em andamento: ${resumoDeUso()}`
  );
};

export default {
  tetoPorEmpresa,
  ligacoesEmAndamento,
  reservarVaga,
  liberarVaga,
  resumoDeUso,
  registrarEspera
};
