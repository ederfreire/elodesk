import logger from "./logger";

/**
 * Cache global em memória LID ↔ PN (Phone Number).
 * Alimentado por:
 *   - messaging-history.set (contatos com campo lid)
 *   - contacts.upsert / contacts.update
 *   - lid-mapping.update event do Baileys
 *   - WhatsappLidMap DB (carregado no boot)
 *
 * Usado como PRIMEIRO fallback na resolução de LID → número real.
 */

// LID (sem @lid) → PN (sem @s.whatsapp.net)
const lidToPnMap = new Map<string, string>();
// PN → LID (reverse lookup)
const pnToLidMap = new Map<string, string>();

function normalizeLid(lid: string): string {
  return lid.replace(/@lid$/, "").replace(/@s\.whatsapp\.net$/, "").replace(/:\d+$/, "").replace(/\D/g, "");
}

function normalizePn(pn: string): string {
  return pn.replace(/@s\.whatsapp\.net$/, "").replace(/@lid$/, "").replace(/:\d+$/, "").replace(/\D/g, "");
}

function isValidPhoneNumber(num: string): boolean {
  return !!num && num.length >= 8 && num.length <= 14 && !num.startsWith("0");
}

function isLikelyLid(num: string): boolean {
  return num.length >= 15 || (num.startsWith("0") && num.length > 10) || (num.startsWith("110101") && num.length >= 13);
}

export function addLidPnMapping(lid: string, pn: string): void {
  const normalizedLid = normalizeLid(lid);
  const normalizedPn = normalizePn(pn);

  if (!normalizedLid || !normalizedPn) return;
  if (!isValidPhoneNumber(normalizedPn)) return;
  if (isLikelyLid(normalizedPn)) return; // Don't map LID to LID

  lidToPnMap.set(normalizedLid, normalizedPn);
  pnToLidMap.set(normalizedPn, normalizedLid);
}

/**
 * Resolve um LID para número de telefone real.
 * Aceita qualquer formato: "252810767634561", "252810767634561@lid", "252810767634561:0@lid"
 */
export function resolvePN(lid: string): string | null {
  const normalized = normalizeLid(lid);
  return lidToPnMap.get(normalized) || null;
}

/**
 * Resolve um número de telefone para LID.
 */
export function resolveLid(pn: string): string | null {
  const normalized = normalizePn(pn);
  return pnToLidMap.get(normalized) || null;
}

/**
 * Processa um array de contatos do Baileys e extrai mapeamentos LID↔PN.
 * Contatos do Baileys podem ter: { id: "5511999@s.whatsapp.net", lid: "252810@lid", ... }
 */
export function extractMappingsFromContacts(contacts: any[]): void {
  if (!contacts || !Array.isArray(contacts)) return;
  let count = 0;

  for (const contact of contacts) {
    if (!contact) continue;

    const id = contact.id || "";
    const lid = contact.lid || "";

    if (!id || !lid) continue;

    const idNum = normalizePn(id);
    const lidNum = normalizeLid(lid);

    if (isValidPhoneNumber(idNum) && !isLikelyLid(idNum) && lidNum && isLikelyLid(lidNum)) {
      addLidPnMapping(lidNum, idNum);
      count++;
    }
  }

  if (count > 0) {
    logger.info(`[LID-CACHE] Extraídos ${count} mapeamentos LID↔PN de ${contacts.length} contatos (total cache: ${lidToPnMap.size})`);
  }
}

/**
 * Retorna o tamanho do cache.
 */
export function getCacheSize(): number {
  return lidToPnMap.size;
}

// ─── CACHE NEGATIVO: LIDs QUE O WHATSAPP NÃO CONSEGUE RESOLVER ─────────────
//
// O cache acima só memoriza SUCESSO. O fracasso não era guardado em lugar
// nenhum, e isso custava caro no canal WhatsApp Plus:
//
// HandleWacallsIncoming tenta resolver LID→número em 3 níveis. Os dois
// primeiros são de graça (campo que já veio no evento; cache acima). O
// terceiro é `resolveLidToPhone`, que vai por HTTP até o wacalls-chat e lá
// dispara um USync à REDE do WhatsApp (GetUserDevices), com timeout de 8s —
// e o `await` fica no meio do processamento da mensagem.
//
// Quando o LID simplesmente não tem mapeamento (conta business com
// privacidade, contato que nunca interagiu por telefone), esse caminho falha
// SEMPRE. Como nada era memorizado, a cadeia inteira — incluindo o USync —
// era refeita a CADA mensagem daquele contato, para sempre. Na prática:
// até 8 segundos de atraso por mensagem, mais uma requisição à rede do
// WhatsApp que ainda por cima conta para o rate-limit da conta.
//
// TTL curto de propósito: se o mapeamento aparecer (o contato passa a
// interagir pelo telefone), a gente volta a tentar em no máximo 1 hora. E
// enquanto está marcado, o comportamento é EXATAMENTE o de hoje quando a
// resolução falha — segue com o LID cru. Não há perda de funcionalidade.
const LID_IRRESOLUVEL_TTL_MS = 60 * 60 * 1000; // 1 hora
const LID_IRRESOLUVEL_TETO = 5000;

const lidsIrresolviveis = new Map<string, number>();

/**
 * Marca um LID como "não resolvível agora". Chamado quando as três tentativas
 * de resolução falharam.
 */
export function marcarLidIrresoluvel(lid: string): void {
  const normalizado = normalizeLid(lid);
  if (!normalizado) return;

  // Limpeza oportunista: sem isso o mapa cresceria uma entrada por LID para
  // sempre. Só varre quando passa do teto, para não pagar O(n) toda vez.
  if (lidsIrresolviveis.size >= LID_IRRESOLUVEL_TETO) {
    const agora = Date.now();
    for (const [chave, expiraEm] of lidsIrresolviveis) {
      if (expiraEm <= agora) lidsIrresolviveis.delete(chave);
    }
    // Se ainda estiver cheio (todos válidos), descarta o mais antigo para
    // manter o teto — preferível a crescer sem limite.
    if (lidsIrresolviveis.size >= LID_IRRESOLUVEL_TETO) {
      const primeiro = lidsIrresolviveis.keys().next();
      if (!primeiro.done) lidsIrresolviveis.delete(primeiro.value);
    }
  }

  lidsIrresolviveis.set(normalizado, Date.now() + LID_IRRESOLUVEL_TTL_MS);
}

/**
 * Diz se vale a pena gastar uma consulta de rede tentando resolver este LID.
 * Retorna true quando ele falhou recentemente e ainda está dentro do TTL.
 *
 * Se o mapeamento POSITIVO já existir, nunca considera irresolúvel — o
 * positivo sempre ganha do negativo.
 */
export function lidEhIrresoluvel(lid: string): boolean {
  const normalizado = normalizeLid(lid);
  if (!normalizado) return false;
  if (lidToPnMap.has(normalizado)) return false;

  const expiraEm = lidsIrresolviveis.get(normalizado);
  if (expiraEm === undefined) return false;

  if (expiraEm <= Date.now()) {
    lidsIrresolviveis.delete(normalizado);
    return false;
  }
  return true;
}

/**
 * Tamanho do cache negativo (diagnóstico).
 */
export function getCacheNegativoSize(): number {
  return lidsIrresolviveis.size;
}

/**
 * Carrega mapeamentos LID↔PN do lid-mapping nativo do Baileys (armazenado na sessão).
 * O Baileys v7 RC.5+ armazena mapeamentos em keys.lidMapping como { "LID_NUMBER": "PN_NUMBER@s.whatsapp.net" }
 */
export function loadFromBaileysLidMapping(lidMapping: Record<string, any> | undefined): void {
  if (!lidMapping || typeof lidMapping !== "object") return;
  let count = 0;

  for (const [key, value] of Object.entries(lidMapping)) {
    if (!key || !value) continue;
    // O formato pode ser: key = LID number, value = PN@s.whatsapp.net (ou string JSON)
    // Ou key = "LID_NUMBER_reverse", value = LID (reverse lookup)
    if (key.endsWith("_reverse")) continue;

    const lidNum = key.replace(/@lid$/, "").replace(/\D/g, "");
    let pnNum = "";

    if (typeof value === "string") {
      pnNum = value.replace(/@s\.whatsapp\.net$/, "").replace(/@lid$/, "").replace(/\D/g, "");
    } else if (typeof value === "object" && value !== null) {
      // Pode ser um buffer ou objeto serializado
      const str = value.toString?.() || JSON.stringify(value);
      const match = str.match(/(\d{8,14})/);
      if (match) pnNum = match[1];
    }

    if (lidNum && pnNum && isValidPhoneNumber(pnNum) && isLikelyLid(lidNum) && !isLikelyLid(pnNum)) {
      addLidPnMapping(lidNum, pnNum);
      count++;
    }
  }

  if (count > 0) {
    logger.info(`[LID-CACHE] ✅ Carregados ${count} mapeamentos do lid-mapping nativo do Baileys (total cache: ${lidToPnMap.size})`);
  }
}

/**
 * Limpa o cache (para testes).
 */
export function clearCache(): void {
  lidToPnMap.clear();
  pnToLidMap.clear();
}
