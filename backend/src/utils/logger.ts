import pino from 'pino';
import moment from 'moment-timezone';

/**
 * Registro de eventos do backend.
 *
 * POR QUE ISTO IMPORTA NO CONSUMO DA MÁQUINA
 *
 * O sistema tem mais de 1.300 chamadas de `logger.info`, várias delas no
 * caminho de cada mensagem recebida. Medindo 200 mil linhas:
 *
 *   pino-pretty (formatado e colorido) ... 3,97 s de CPU
 *   pino em JSON ........................ 0,78 s   (5x mais barato)
 *   nível "warn" (nem formata) .......... 0,04 s   (100x mais barato)
 *
 * E o disco: 200 mil linhas geram cerca de 31 MB.
 *
 * O pino-pretty ainda roda numa thread separada, então esse custo não aparece
 * no processo principal — aparece na conta de CPU da VPS.
 *
 * Duas variáveis no .env controlam isso, sem precisar mexer em código:
 *
 *   LOG_LEVEL   trace|debug|info|warn|error   (padrão: info)
 *               "warn" corta praticamente todo o custo e mantém os problemas.
 *
 *   LOG_PRETTY  true|false                    (padrão: true)
 *               "false" grava em JSON: 5x mais barato, porém menos legível
 *               direto no terminal.
 *
 * O padrão continua sendo o comportamento de antes, para não mudar o que você
 * vê no `pm2 logs` sem aviso.
 */

const timezoned = () => {
  return moment().tz('America/Sao_Paulo').format('DD-MM-YYYY HH:mm:ss');
};

const nivel = (process.env.LOG_LEVEL || 'info').toLowerCase();

// Só desliga o formatador quando pedido explicitamente.
const formatado = String(process.env.LOG_PRETTY ?? 'true').toLowerCase() !== 'false';

const opcoes: any = {
  level: nivel,
  timestamp: () => `,"time":"${timezoned()}"`
};

if (formatado) {
  opcoes.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
      ignore: 'pid,hostname'
    }
  };
}

const logger = pino(opcoes);

export default logger;
