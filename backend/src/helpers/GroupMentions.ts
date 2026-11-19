/**
 * Menção individual em grupo (@numero).
 *
 * COMO O WHATSAPP MARCA ALGUÉM
 *
 * Marcar uma pessoa exige DUAS coisas ao mesmo tempo:
 *
 *   1. o texto conter "@numero" (é isso que o app desenha em azul);
 *   2. o número aparecer em contextInfo.mentionedJid (é isso que notifica).
 *
 * Só o texto = aparece azul pra ninguém e não notifica.
 * Só o mentionedJid = notifica sem mostrar nada (é o "ghost mention"/@all).
 *
 * O envio normal do atendente mandava apenas o texto. Quem digitava
 * "@5511999999999 confere isso" via o texto cru chegar no grupo, sem link e
 * sem notificação — que é exatamente o sintoma de "a menção não funciona".
 * Esta função extrai os números escritos no texto para preencher a lista de
 * mentionedJid, mantendo o texto intacto.
 *
 * REGRA DOS DÍGITOS
 *
 * Exige de 8 a 15 dígitos para não transformar valor, ano ou código em
 * menção: "@2026" (4) e "@1500" (4) ficam de fora; "5511999999999" (13) entra.
 * O (?!\d) impede casar só um pedaço de um número maior.
 */

const REGEX_MENCAO = /@(\d{8,15})(?!\d)/g;

/**
 * Devolve os JIDs a marcar, sem repetição e na ordem em que aparecem.
 * Texto vazio, nulo ou sem "@numero" devolve lista vazia — e lista vazia
 * significa "envie exatamente como era antes".
 */
export const extrairMencoes = (texto?: string | null): string[] => {
  if (!texto || typeof texto !== "string") return [];
  if (texto.indexOf("@") === -1) return [];

  const encontrados = new Set<string>();
  const regex = new RegExp(REGEX_MENCAO.source, "g");

  let achado: RegExpExecArray | null = regex.exec(texto);
  while (achado !== null) {
    encontrados.add(`${achado[1]}@s.whatsapp.net`);
    achado = regex.exec(texto);
  }

  return Array.from(encontrados);
};

export default extrairMencoes;
