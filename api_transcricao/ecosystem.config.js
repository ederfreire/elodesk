// Nome com sublinhado, igual ao usado pelo install-python-app.sh e pelo
// instalador. Estava "api-transcricao" (hífen) aqui e "api_transcricao"
// (sublinhado) no script: quem passava pelos dois ficava com duas entradas no
// PM2 disputando a porta 4002, e a segunda morria em loop com
// "Address already in use".
module.exports = {
  apps: [
    {
      name: "api_transcricao",
      script: "main.py",
      // Caminho relativo ao próprio arquivo: o PM2 usa a pasta do
      // ecosystem.config.js como diretório de trabalho.
      interpreter: "./venv/bin/python3",
      cwd: __dirname,
      watch: false,
    }
  ]
}
