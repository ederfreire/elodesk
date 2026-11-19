import planoLibera from "../../helpers/planoLibera";
import UtmLink from "../../models/UtmLink";
import Contact from "../../models/Contact";
import logger from "../../utils/logger";

/**
 * Liga um contato ao link de campanha, lendo o código na primeira mensagem.
 *
 * O código aparece no texto como [EQ:XXXXXX] — a mensagem pré-preenchida do
 * wa.me leva isso do anúncio até a conversa. É o único caminho disponível:
 * o wa.me descarta qualquer parâmetro que não seja `text`, e o app não
 * repassa nada da URL para dentro da conversa.
 */

// Aceita maiúsculas/minúsculas e espaços em volta, porque encaminhamentos e
// alguns teclados alteram o texto colado.
const PADRAO = /\[\s*EQ\s*:\s*([A-Za-z0-9]{4,16})\s*\]/i;

export const extrairCodigoUtm = (texto: string): string | null => {
  const achado = PADRAO.exec(String(texto || ""));
  return achado ? achado[1].toUpperCase() : null;
};

/** Remove a marcação do corpo, para o atendente não ver o código na conversa. */
export const limparCodigoUtm = (texto: string): string =>
  String(texto || "")
    .replace(PADRAO, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const IdentifyUtmFromMessage = async (
  corpo: string,
  contactId: number,
  companyId: number
): Promise<UtmLink | null> => {
  const codigo = extrairCodigoUtm(corpo);
  if (!codigo || !contactId) return null;
  if (!(await planoLibera(companyId, "useUtmLinks"))) return null;

  try {
    const link = await UtmLink.findOne({ where: { code: codigo, companyId } });
    if (!link) return null;

    const contato = await Contact.findOne({
      where: { id: contactId, companyId }
    });
    if (!contato) return null;

    // Primeira origem vence: se o contato já veio de um anúncio, um clique
    // posterior em outro link não reescreve de onde ele veio originalmente.
    // Sem isso, um lead que voltasse por outra campanha "trocaria de dono" e
    // o relatório do primeiro anúncio perderia a conversão.
    if (contato.utmLinkId) return null;

    await contato.update({
      utmLinkId: link.id,
      // Preenche a origem só quando ainda estiver vazia — escolha manual do
      // atendente tem prioridade sobre a automática.
      ...(contato.leadSource ? {} : { leadSource: link.source })
    });

    await link.increment("clicks");

    logger.info(
      `[UTM] Contato ${contactId} atribuído ao link ${link.id} (${link.name}) pelo código ${codigo}`
    );

    return link;
  } catch (err: any) {
    // Atribuição é acessório: não pode impedir a mensagem de ser salva.
    logger.warn(`[UTM] Falha ao identificar origem: ${err?.message}`);
    return null;
  }
};

export default IdentifyUtmFromMessage;
