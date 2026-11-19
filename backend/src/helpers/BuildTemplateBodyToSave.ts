/**
 * Helpers para montar o `body` que será salvo na Message ao enviar um
 * template (WhatsApp Oficial), de forma compatível com o componente
 * `frontend/src/components/MessagesList/templates.js`.
 *
 * Formato esperado pelo frontend:
 *   "<URL da imagem opcional>\n<texto renderizado>||||<JSON dos botões>"
 *
 * O `Template` no frontend:
 *  - Extrai a primeira URL de imagem/video do texto (regex .jpg/.png/...).
 *  - Faz split em `||||` para separar texto de botões.
 *  - `buttonsJson` é parseado 2x (JSON.parse(JSON.parse(...))).
 *    Por isso usamos `JSON.stringify([buttons])`.
 */

type AnyComponent = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: any;
  example?: any;
  parameters?: any[];
};

const stringifyButtonsForFrontend = (buttons: any[]): string => {
  // O frontend faz JSON.parse(JSON.parse(buttonsJson)).
  // O Template.js do projeto monta `buttonsToSave` como array contendo o
  // array de botões já em string. Replicamos esse comportamento aqui para
  // manter compatibilidade.
  if (!Array.isArray(buttons) || buttons.length === 0) return "[]";
  return JSON.stringify([JSON.stringify(buttons)]);
};

const normalizeButtonsField = (raw: any): any[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

/**
 * Extrai a URL da imagem do header (se houver) e o texto do body já
 * renderizado a partir dos componentes da Meta (`templateData.components`)
 * combinados com a definição original do template salvo localmente
 * (`templateComponents` do QuickMessage).
 */
export const buildTemplateBodyToSave = (
  templateComponents: AnyComponent[] | undefined | null,
  metaComponents: AnyComponent[] | undefined | null,
  fallbackText: string = ""
): string => {
  const tpl = Array.isArray(templateComponents) ? templateComponents : [];
  const meta = Array.isArray(metaComponents) ? metaComponents : [];

  // --- 1. URL da imagem do header ---
  let imageUrl = "";
  const metaHeader = meta.find(
    c => String(c?.type || "").toLowerCase() === "header"
  );
  if (metaHeader && Array.isArray(metaHeader.parameters)) {
    const imgParam = metaHeader.parameters.find(
      (p: any) => p?.type === "image" && p?.image?.link
    );
    if (imgParam) imageUrl = String(imgParam.image.link);
  }

  // --- 2. Texto do body renderizado ({{1}}, {{2}}...) ---
  const tplBody = tpl.find(
    c => String(c?.type || "").toUpperCase() === "BODY"
  );
  const metaBody = meta.find(
    c => String(c?.type || "").toLowerCase() === "body"
  );
  let bodyText = tplBody?.text || fallbackText || "";
  if (metaBody && Array.isArray(metaBody.parameters)) {
    metaBody.parameters.forEach((p: any, idx: number) => {
      const placeholder = new RegExp(`\\{\\{\\s*${idx + 1}\\s*\\}\\}`, "g");
      bodyText = bodyText.replace(placeholder, String(p?.text ?? ""));
    });
  }

  // --- 3. Botões ---
  const tplButtons = tpl.find(
    c => String(c?.type || "").toUpperCase() === "BUTTONS"
  );
  const buttons = normalizeButtonsField(tplButtons?.buttons);

  // --- 4. Compor saída ---
  const textParts: string[] = [];
  if (imageUrl) textParts.push(imageUrl);
  if (bodyText) textParts.push(bodyText);
  const textBlock = textParts.join("\n");

  return `${textBlock}||||${stringifyButtonsForFrontend(buttons)}`;
};

export default buildTemplateBodyToSave;