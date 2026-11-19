/**
 * Registro das chamadas originadas por campanha de voz.
 *
 * POR QUE EXISTE
 *
 * A campanha disca pelo mesmo caminho de uma ligação comum, então os eventos
 * que voltam do microserviço são idênticos aos de uma chamada feita por um
 * atendente. O resultado é que a tela de ligação abre no navegador de quem
 * estiver com o sistema aberto — mostrando o número do contato e um botão de
 * desligar para uma ligação que ninguém fez e ninguém deve atender.
 *
 * Numa campanha com centenas de contatos isso vira uma sequência de telas
 * piscando na cara do atendente.
 *
 * Marcando o id da chamada aqui, o tratador de eventos sabe que aquilo é
 * disparo automático e não avisa a interface. O registro no banco continua
 * sendo feito normalmente — o histórico e os relatórios não perdem nada.
 *
 * A entrada se apaga sozinha: uma chamada de campanha dura segundos, e sem
 * expiração o conjunto cresceria para sempre num processo de longa duração.
 */

const VALIDADE_MS = 10 * 60 * 1000;

const chamadas = new Map<string, number>();

const limpar = () => {
  const agora = Date.now();
  for (const [id, expira] of chamadas) {
    if (expira <= agora) chamadas.delete(id);
  }
};

export const marcarChamadaDeCampanha = (callId: string): void => {
  if (!callId) return;
  limpar();
  chamadas.set(String(callId), Date.now() + VALIDADE_MS);
};

export const ehChamadaDeCampanha = (callId: string): boolean => {
  if (!callId) return false;
  const expira = chamadas.get(String(callId));
  if (!expira) return false;
  if (expira <= Date.now()) {
    chamadas.delete(String(callId));
    return false;
  }
  return true;
};

export const esquecerChamadaDeCampanha = (callId: string): void => {
  if (callId) chamadas.delete(String(callId));
};

export default {
  marcarChamadaDeCampanha,
  ehChamadaDeCampanha,
  esquecerChamadaDeCampanha
};
