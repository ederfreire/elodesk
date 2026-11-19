/**
 * O nome que o WhatsApp manda nem sempre é um nome.
 *
 * O `pushName` (Baileys/WhatsApp Plus) e o `nameContact` (API Oficial) vêm do
 * perfil de quem enviou. Em três situações eles chegam com lixo, e esse lixo
 * era gravado como nome do contato:
 *
 *   1. NÚMERO MASCARADO — "+34•••••31", "+55·····27".
 *      É o que o WhatsApp envia quando quem escreve está com a privacidade do
 *      número ativada (típico de quem fala a partir de grupo ou comunidade).
 *      Não é um nome: é o próprio número censurado. Salvo no cadastro, some a
 *      única informação útil e o contato fica impossível de identificar.
 *
 *   2. LID OU NÚMERO PURO — "16265796141093", "5581999998876".
 *      Identificador interno ou o próprio telefone repetido no campo de nome.
 *
 *   3. VAZIO / só espaços.
 *
 * Em qualquer um dos casos o certo é usar o número real como nome provisório,
 * que pelo menos é pesquisável e reconhecível.
 *
 * O que NÃO deve ser recusado: nome legítimo que contenha dígitos
 * ("Loja 24h", "Maria 2", "Padaria 7 Irmãos"). Por isso o teste é específico
 * em vez de "tem número, recusa".
 */

/** Caracteres que o WhatsApp usa para censurar o número no lugar do nome. */
const CARACTERES_DE_MASCARA = /[•·⋅∙●⚫*]/;

/**
 * Diz se o "nome" recebido não serve como nome de contato.
 *
 * @param nome valor recebido de pushName / nameContact
 */
export const nomeDeContatoInvalido = (nome?: string | null): boolean => {
  if (!nome) return true;

  const limpo = String(nome).trim();
  if (!limpo) return true;

  // 1. Número mascarado: começa com "+" ou dígito, tem caractere de máscara e
  //    nada além de dígitos, máscara, espaço, parênteses, "+" e "-".
  if (CARACTERES_DE_MASCARA.test(limpo)) {
    const sobra = limpo.replace(/[\d\s()+\-•·⋅∙●⚫*]/g, "");
    if (sobra.length === 0) return true;
  }

  // 2. Só dígitos (com ou sem "+", espaços, parênteses e traços): é número ou
  //    LID, não nome. Exige 8+ dígitos para não recusar um apelido tipo "51".
  const digitos = limpo.replace(/\D/g, "");
  const soNumero = /^[\d\s()+\-]+$/.test(limpo);
  if (soNumero && digitos.length >= 8) return true;

  return false;
};

/**
 * Devolve o nome a gravar: o recebido quando presta, senão o número.
 */
export const nomeDeContatoOuNumero = (
  nome: string | null | undefined,
  numero: string
): string => (nomeDeContatoInvalido(nome) ? numero : String(nome).trim());

export default nomeDeContatoInvalido;
