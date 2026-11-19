interface Timeout {
  id: string;
  timeout: NodeJS.Timeout;
}

const timeouts: Timeout[] = [];

const findAndClearTimeout = (key: string) => {
  if (timeouts.length > 0) {
    const timeoutIndex = timeouts.findIndex(timeout => timeout.id === key);

    if (timeoutIndex !== -1) {
      clearTimeout(timeouts[timeoutIndex].timeout);
      timeouts.splice(timeoutIndex, 1);
    }
  }
};

// ── Por que a chave não pode ser só o ticketId ──────────────────────────────
// Achado revisando o bug "quando a posição de fila está ativada, não envia
// nada pro cliente": TODAS as mensagens automáticas debounced deste arquivo
// (saudação, fora de horário, posição na fila, etc.) usavam o MESMO
// identificador — só `ticket.id`. `debounce()` cancela qualquer timer
// pendente com a mesma chave antes de agendar um novo. Quando a posição de
// fila está ligada, o bot manda a saudação E a posição em sequência rápida
// pro mesmo ticket — a chamada da posição cancelava o timer da saudação
// (que nunca chegava a disparar), e se mais alguma coisa fosse agendada
// depois (outra debounced call pro mesmo ticket), cancelava a posição
// também. Resultado: nada chegava.
//
// A chave agora é `${ticketId}:${propósito}` — cada tipo de mensagem tem seu
// próprio timer, e só cancela a si mesmo se disparado de novo rapidamente
// (que é o comportamento que o debounce deveria ter desde o início: evitar
// SUA PRÓPRIA duplicação, não cancelar mensagens de tipos diferentes).
const debounce = (
  func: { (): Promise<void>; (...args: never[]): void },
  wait: number,
  key: string | number
) => {
  const normalizedKey = String(key);
  return function executedFunction(...args: never[]): void {
    const later = () => {
      findAndClearTimeout(normalizedKey);
      func(...args);
    };

    findAndClearTimeout(normalizedKey);

    const newTimeout = {
      id: normalizedKey,
      timeout: setTimeout(later, wait)
    };

    timeouts.push(newTimeout);
  };
};

export { debounce };
