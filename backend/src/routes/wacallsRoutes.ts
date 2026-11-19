import { Router } from "express";
import isAuth from "../middleware/isAuth";
import WacallsController, { callHistory, voiceFlows } from "../controllers/WacallsController";

const wacallsRoutes = Router();

// Webhook do microserviço (auth por header X-WaCalls-Secret, não JWT do usuário)
wacallsRoutes.post("/wacalls/webhook", WacallsController.webhook);

// Proxy SSE do QR do microserviço para o frontend do usuário logado
wacallsRoutes.get("/wacalls/qr/:whatsappId", isAuth, WacallsController.qrStream);
wacallsRoutes.get("/wacalls/qr/:whatsappId/latest", isAuth, WacallsController.qrLatest);

// Proxies autenticados pelo backend: o navegador usa JWT do EquipeChat, e o
// backend assina a chamada interna com WACALLS_SHARED_SECRET.
wacallsRoutes.get("/wacalls/sessions", isAuth, WacallsController.sessionsProxy);
wacallsRoutes.post("/wacalls/sessions", isAuth, WacallsController.createSessionProxy);
wacallsRoutes.delete("/wacalls/sessions/:sessionId", isAuth, WacallsController.deleteSessionProxy);
wacallsRoutes.post("/wacalls/calls/dial", isAuth, WacallsController.dialProxy);
wacallsRoutes.post("/wacalls/calls/:callId/answer", isAuth, WacallsController.answerProxy);
wacallsRoutes.post("/wacalls/calls/:callId/hangup", isAuth, WacallsController.hangupProxy);
// SDP offer/answer do navegador — é o que liga o áudio de verdade na chamada.
wacallsRoutes.post("/wacalls/calls/:callId/webrtc", isAuth, WacallsController.webrtcProxy);
// Bug antigo: (WacallsController as any).callHistory sempre dava undefined
// aqui, porque callHistory é um named export declarado DEPOIS do "export
// default {...}" no controller — não fazia parte do objeto default. A rota
// caía sempre no fallback "res.json([])", por isso o histórico nunca
// aparecia no discador por mais que a tabela CallHistory tivesse dados.
// Importando o named export direto resolve, sem depender de ordem de
// declaração dentro do controller.
wacallsRoutes.get("/wacalls/calls/history", isAuth, callHistory);

// Pareamento da sessão de CHAMADA (wacalls-chat) — separado do pareamento de
// mensagem (wacalls-voip) acima. Precisa escanear como um segundo aparelho
// no mesmo número.
wacallsRoutes.post("/wacalls/chat-session/:whatsappId/start", isAuth, WacallsController.startChatSession);
wacallsRoutes.get("/wacalls/chat-session/:whatsappId/qr", isAuth, WacallsController.chatSessionQr);
// Importar mensagens anteriores (history sync sob demanda, botão na tela de
// conexão) — ver WacallsController.importHistoryProxy.
wacallsRoutes.post("/wacalls/chat-session/:whatsappId/import-history", isAuth, WacallsController.importHistoryProxy);

// Troncal SIP (baresip) — extensão do discador do WhatsApp Plus pra também
// ligar/receber por uma linha SIP comum (Asterisk, FreePBX, operadora VoIP),
// sem depender do WhatsApp. Única/global pro servidor (sem :sessionId).
wacallsRoutes.get("/wacalls/sip/settings", isAuth, WacallsController.sipSettingsGet);
wacallsRoutes.put("/wacalls/sip/settings", isAuth, WacallsController.sipSettingsSet);
wacallsRoutes.get("/wacalls/sip/status", isAuth, WacallsController.sipStatusProxy);
wacallsRoutes.post("/wacalls/sip/calls/dial", isAuth, WacallsController.sipDialProxy);
wacallsRoutes.post("/wacalls/sip/calls/:callId/answer", isAuth, WacallsController.sipAnswerProxy);
wacallsRoutes.post("/wacalls/sip/calls/:callId/hangup", isAuth, WacallsController.sipHangupProxy);
wacallsRoutes.post("/wacalls/sip/calls/:callId/webrtc", isAuth, WacallsController.sipWebrtcProxy);

// URA de voz: fluxos disponíveis pra vincular na conexão
wacallsRoutes.get("/wacalls/voice-flows", isAuth, voiceFlows);

export default wacallsRoutes;

