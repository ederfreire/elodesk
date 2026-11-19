import moment from "moment";

/**
 * Variáveis das mensagens de campanha — um lugar só.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * Havia DUAS implementações independentes, e elas divergiram:
 *
 *   queues.ts (getProcessedMessage) — disparo normal da campanha:
 *     {nome} {primeiroNome} {email} {numero} {atendente} {greeting}
 *     {protocol} + variáveis personalizadas da campanha
 *
 *   SendCampaignFollowUps.ts — mensagens de follow-up:
 *     {nome} {numero} {email} {primeiroNome}   ← só quatro
 *
 * Resultado: a mesma variável que funcionava no disparo chegava crua no
 * follow-up. Quem escrevia "{greeting} {nome}, tudo bem?" recebia o primeiro
 * envio certo e o follow-up com "{greeting}" literal no meio do texto.
 *
 * Além disso, nenhuma das duas aceitava a forma de CHAVE DUPLA ({{nome}}).
 * O resto da plataforma — saudação, fluxo, mensagem interativa — usa Mustache
 * com chave dupla, então é natural o operador escrever assim aqui também, e
 * a variável simplesmente não era trocada.
 *
 * Agora as duas formas valem, e as duas telas usam esta mesma função.
 */

export interface DadosDoContatoNaCampanha {
  name?: string | null;
  number?: string | null;
  email?: string | null;
  id?: number | null;
  userName?: string | null;
}

export interface VariavelPersonalizada {
  key: string;
  value: string;
}

/** Bom dia / Boa tarde / Boa noite pela hora atual. */
export const saudacaoPorHora = (): string => {
  const hora = moment().hour();
  if (hora >= 6 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
};

/**
 * Troca uma variável aceitando {chave} E {{chave}}, com ou sem espaços
 * internos ({{ nome }}). A chave é escapada para nunca virar um curinga de
 * regex sem querer — variável personalizada pode ter qualquer nome.
 */
const trocar = (texto: string, chave: string, valor: string): string => {
  const chaveEscapada = chave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // {{ chave }} primeiro: se trocasse {chave} antes, sobraria um par de chaves
  // órfão ("{Fulano}") no lugar de "{{nome}}".
  const dupla = new RegExp(`\\{\\{\\s*${chaveEscapada}\\s*\\}\\}`, "gi");
  const simples = new RegExp(`\\{\\s*${chaveEscapada}\\s*\\}`, "gi");
  return texto.replace(dupla, valor).replace(simples, valor);
};

/**
 * Aplica todas as variáveis numa mensagem de campanha.
 *
 * Variável sem valor vira string vazia — melhor um espaço em branco do que
 * "{email}" aparecendo para o cliente.
 */
export const aplicarVariaveisDeCampanha = (
  mensagem: string,
  contato: DadosDoContatoNaCampanha,
  variaveis: VariavelPersonalizada[] = []
): string => {
  if (!mensagem) return "";

  const nome = contato?.name || "";
  const primeiroNome = nome ? nome.split(" ")[0] : "";
  const numero = contato?.number || "";
  const email = contato?.email || "";
  const atendente = contato?.userName || "Atendente";
  const protocolo = `${moment().format("YYYYMMDDHHmmss")}${contato?.id || ""}`;

  // Cada variável com seus apelidos — em português e inglês, porque a
  // plataforma usa os dois em telas diferentes e o operador não tem como
  // adivinhar qual vale onde.
  const tabela: Record<string, string> = {
    nome,
    name: nome,
    primeiroNome,
    primeiro_nome: primeiroNome,
    firstName: primeiroNome,
    numero,
    number: numero,
    email,
    atendente,
    userName: atendente,
    greeting: saudacaoPorHora(),
    saudacao: saudacaoPorHora(),
    ms: saudacaoPorHora(),
    protocol: protocolo,
    protocolo,
    hora: moment().format("HH:mm:ss"),
    hour: moment().format("HH:mm:ss"),
    data: moment().format("DD-MM-YYYY"),
    date: moment().format("DD-MM-YYYY")
  };

  let resultado = mensagem;
  for (const [chave, valor] of Object.entries(tabela)) {
    resultado = trocar(resultado, chave, valor);
  }

  // Variáveis personalizadas da campanha vêm por último: se alguém criar uma
  // chamada "nome", a dela é que vale.
  if (Array.isArray(variaveis)) {
    for (const v of variaveis) {
      if (!v?.key) continue;
      resultado = trocar(resultado, v.key, v.value ?? "");
    }
  }

  return resultado;
};

export default aplicarVariaveisDeCampanha;
