export const CHATBOT_MAIN_MENU_LABEL = "Voltar para o menu principal";
export const CHATBOT_EXIT_LABEL = "Encerrar atendimento";

export const buildChatbotBackAndExitText = (options: string) =>
  options.length > 0
    ? `${options}\n*[ # ]* ${CHATBOT_MAIN_MENU_LABEL}\n*[ Sair ]* ${CHATBOT_EXIT_LABEL}`
    : `${options}\n*[ Sair ]* ${CHATBOT_EXIT_LABEL}`;

export const buildChatbotExitOnlyText = (options: string) =>
  `${options}\n*[ Sair ]* ${CHATBOT_EXIT_LABEL}`;

export const buildFacebookChatbotBackText = (options: string) =>
  options.length > 0 ? `${options}\n*#* ${CHATBOT_MAIN_MENU_LABEL}` : options;