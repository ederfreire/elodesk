/*
 * Widget flutuante do WebChat — EquipeChat.
 *
 * Esse arquivo estava referenciado no backend (rota /public já configurada,
 * CORS já liberado, tem até comentário em app.ts explicando) mas o arquivo
 * em si nunca tinha sido criado — por isso o <script src=".../public/webchat.js">
 * sempre dava 404 silencioso e nada aparecia no site, mesmo o embed via
 * <iframe> direto funcionando normalmente.
 *
 * Uso:
 *   <script
 *     src="https://SEU-BACKEND/public/webchat.js"
 *     data-token="TOKEN-DA-CONEXAO"
 *     data-api="https://SEU-BACKEND"
 *     data-color="#4E93FF"
 *     data-label="Fale conosco"
 *     data-position="right"
 *     async
 *   ></script>
 *
 * Sobre api vs app: o iframe do webchat é servido pelo FRONTEND (app.*),
 * não pelo backend (api.*) — são domínios diferentes por design. Esse
 * script assume por padrão que o frontend está no mesmo domínio trocando
 * "api." por "app." no início do host (é o padrão que os dois exemplos que
 * você mandou já seguem: app.wha.mypersonalcloud.es / api.wha.mypersonalcloud.es).
 * Se o seu domínio não seguir esse padrão, informe data-app explicitamente
 * e o script usa esse valor em vez de adivinhar.
 */
(function () {
  "use strict";

  var currentScript =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  if (!currentScript) return;

  var token = currentScript.getAttribute("data-token");
  if (!token) {
    console.error("[EquipeChat WebChat] data-token não informado no <script>.");
    return;
  }

  var apiBase = (currentScript.getAttribute("data-api") || "").replace(/\/+$/, "");
  if (!apiBase) {
    console.error("[EquipeChat WebChat] data-api não informado no <script>.");
    return;
  }

  // api.dominio.com -> app.dominio.com, só quando data-app não é informado.
  var appBaseAttr = (currentScript.getAttribute("data-app") || "").replace(/\/+$/, "");
  var appBase =
    appBaseAttr ||
    apiBase.replace(/^(https?:\/\/)api\./i, "$1app.") ||
    apiBase;

  var overrideColor = currentScript.getAttribute("data-color");
  var overrideLabel = currentScript.getAttribute("data-label");
  var position = (currentScript.getAttribute("data-position") || "right").toLowerCase();
  if (position !== "left" && position !== "right") position = "right";

  var WIDTH = 380;
  var HEIGHT = 560;
  var iframeSrc = appBase + "/webchat/" + encodeURIComponent(token);

  function injectStyles() {
    if (document.getElementById("equipechat-webchat-style")) return;
    var style = document.createElement("style");
    style.id = "equipechat-webchat-style";
    style.textContent = [
      ".ec-webchat-bubble{position:fixed;bottom:20px;" + position + ":20px;",
      "width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;",
      "box-shadow:0 6px 20px rgba(0,0,0,0.25);z-index:2147483000;",
      "display:flex;align-items:center;justify-content:center;",
      "transition:transform 0.15s ease;}",
      ".ec-webchat-bubble:hover{transform:scale(1.06);}",
      ".ec-webchat-bubble svg{width:28px;height:28px;}",
      ".ec-webchat-panel{position:fixed;bottom:92px;" + position + ":20px;",
      "width:" + WIDTH + "px;max-width:calc(100vw - 24px);",
      "height:" + HEIGHT + "px;max-height:calc(100vh - 120px);",
      "border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.3);",
      "z-index:2147483000;display:none;background:#fff;}",
      ".ec-webchat-panel.ec-open{display:block;}",
      ".ec-webchat-panel iframe{width:100%;height:100%;border:0;display:block;}",
      ".ec-webchat-badge{position:absolute;top:-4px;" + (position === "right" ? "left:-4px;" : "right:-4px;"),
      "background:#EF4444;color:#fff;font-size:11px;font-weight:700;",
      "min-width:18px;height:18px;border-radius:9px;display:flex;",
      "align-items:center;justify-content:center;padding:0 4px;",
      "border:2px solid #fff;pointer-events:none;}"
    ].join("");
    document.head.appendChild(style);
  }

  function chatIconSvg() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" ' +
      'stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    );
  }

  function closeIconSvg() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M18 6 6 18M6 6l12 12" stroke="white" stroke-width="2.2" stroke-linecap="round"/></svg>'
    );
  }

  function build(cfg) {
    var color = overrideColor || (cfg && cfg.primaryColor) || "#4E93FF";
    var label = overrideLabel || (cfg && cfg.title) || "Fale conosco";

    injectStyles();

    var bubble = document.createElement("button");
    bubble.className = "ec-webchat-bubble";
    bubble.type = "button";
    bubble.setAttribute("aria-label", label);
    bubble.style.background = color;
    bubble.innerHTML = chatIconSvg();
    bubble.title = label;

    var panel = document.createElement("div");
    panel.className = "ec-webchat-panel";

    var iframe = document.createElement("iframe");
    iframe.title = label;
    iframe.loading = "lazy";
    iframe.allow = "microphone; camera; clipboard-write";
    // O src só é definido no primeiro clique — evita carregar o chat (e criar
    // sessão) pra quem só está navegando o site sem interagir.
    panel.appendChild(iframe);

    document.body.appendChild(panel);
    document.body.appendChild(bubble);

    var open = false;
    var loaded = false;

    function setOpen(next) {
      open = next;
      panel.classList.toggle("ec-open", open);
      bubble.innerHTML = open ? closeIconSvg() : chatIconSvg();
      bubble.style.background = color;
      if (open && !loaded) {
        iframe.src = iframeSrc;
        loaded = true;
      }
    }

    bubble.addEventListener("click", function () {
      setOpen(!open);
    });

    // Fecha o painel ao clicar fora dele (mas não ao clicar na própria bolha,
    // já tratado acima) — só quando o clique é fora do widget inteiro.
    document.addEventListener("click", function (event) {
      if (!open) return;
      if (panel.contains(event.target) || bubble.contains(event.target)) return;
      setOpen(false);
    });
  }

  function start() {
    // Busca cor/título reais da conexão (mesmos usados no painel do
    // EquipeChat) — se falhar (CORS bloqueado, endpoint fora do ar), cai
    // pros valores de data-color/data-label/padrão sem travar o widget.
    var configUrl = apiBase + "/public/webchat/" + encodeURIComponent(token) + "/config";
    fetch(configUrl)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        build(data && data.config);
      })
      .catch(function () {
        build(null);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
