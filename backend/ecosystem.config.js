/**
 * Configuração do PM2 para o backend.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * O backend era iniciado pela linha de comando, então valiam os padrões do
 * PM2 — e eles são agressivos demais para uma aplicação que carrega sessões
 * de WhatsApp na inicialização:
 *
 *  - kill_timeout padrão: 1600ms. O PM2 mandava parar e, 1,6s depois, matava
 *    à força. O desligamento ainda estava em andamento e a porta continuava
 *    ocupada quando o processo novo tentava subir.
 *
 *  - max_restarts padrão: ~16. Depois de algumas tentativas frustradas
 *    seguidas, o PM2 marcava o processo como "errored" e PARAVA DE TENTAR.
 *    Era por isso que o sistema só voltava com "pm2 reload all" na mão.
 *
 *  - restart_delay padrão: 0. As tentativas aconteciam praticamente juntas,
 *    esgotando o limite acima em segundos e sem dar tempo de a porta liberar.
 *
 * COMO USAR
 *
 *   pm2 delete usepower-backend
 *   pm2 start ecosystem.config.js
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: "usepower-backend",
      script: "dist/server.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,

      // Sempre tentar de novo, sem teto de desistência. Um backend fora do ar
      // esperando intervenção manual é pior que um backend reiniciando.
      autorestart: true,
      max_restarts: 50,

      // Espera crescente entre tentativas (100ms, 200ms, 400ms...) em vez de
      // repetir na mesma hora. Dá tempo de a porta liberar e não queima o
      // limite de tentativas em poucos segundos.
      exp_backoff_restart_delay: 100,

      // Tempo que o processo tem para encerrar sozinho antes do SIGKILL.
      // Precisa ser maior que o prazo do desligamento ordenado (15s no
      // server.ts), senão o PM2 mata no meio do caminho.
      kill_timeout: 20000,

      // Tempo que o PM2 espera a aplicação subir antes de considerar falha.
      // Carregar as sessões do WhatsApp leva mais que o padrão.
      listen_timeout: 60000,

      // Só considera "de pé" depois de 30s rodando. Evita que uma sequência
      // de quedas rápidas conte como inicialização bem-sucedida.
      min_uptime: 30000,

      // Reinicia se passar de 2GB (vazamento), em vez de degradar até travar.
      max_memory_restart: "2G",

      merge_logs: true,
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
