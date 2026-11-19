/**
 * Mapa DDD -> UF e UF -> regiao.
 *
 * A distribuicao geografica e INFERIDA do numero, nao declarada pelo contato:
 * o WhatsApp nao expoe cidade nem estado. Por isso o relatorio fala em
 * "inferida" e sempre mostra quantos contatos ficaram sem mapear — numero
 * fixo antigo, numero portado de outro estado e linha corporativa fazem o DDD
 * mentir, e esconder isso daria uma falsa precisao.
 */

export const DDD_PARA_UF: Record<string, string> = {
  "11": "SP", "12": "SP", "13": "SP", "14": "SP", "15": "SP", "16": "SP",
  "17": "SP", "18": "SP", "19": "SP",
  "21": "RJ", "22": "RJ", "24": "RJ",
  "27": "ES", "28": "ES",
  "31": "MG", "32": "MG", "33": "MG", "34": "MG", "35": "MG", "37": "MG", "38": "MG",
  "41": "PR", "42": "PR", "43": "PR", "44": "PR", "45": "PR", "46": "PR",
  "47": "SC", "48": "SC", "49": "SC",
  "51": "RS", "53": "RS", "54": "RS", "55": "RS",
  "61": "DF",
  "62": "GO", "64": "GO",
  "63": "TO",
  "65": "MT", "66": "MT",
  "67": "MS",
  "68": "AC",
  "69": "RO",
  "71": "BA", "73": "BA", "74": "BA", "75": "BA", "77": "BA",
  "79": "SE",
  "81": "PE", "87": "PE",
  "82": "AL",
  "83": "PB",
  "84": "RN",
  "85": "CE", "88": "CE",
  "86": "PI", "89": "PI",
  "91": "PA", "93": "PA", "94": "PA",
  "92": "AM", "97": "AM",
  "95": "RR",
  "96": "AP",
  "98": "MA", "99": "MA"
};

export const UF_INFO: Record<string, { nome: string; regiao: string }> = {
  AC: { nome: "Acre", regiao: "Norte" },
  AL: { nome: "Alagoas", regiao: "Nordeste" },
  AP: { nome: "Amapá", regiao: "Norte" },
  AM: { nome: "Amazonas", regiao: "Norte" },
  BA: { nome: "Bahia", regiao: "Nordeste" },
  CE: { nome: "Ceará", regiao: "Nordeste" },
  DF: { nome: "Distrito Federal", regiao: "Centro-Oeste" },
  ES: { nome: "Espírito Santo", regiao: "Sudeste" },
  GO: { nome: "Goiás", regiao: "Centro-Oeste" },
  MA: { nome: "Maranhão", regiao: "Nordeste" },
  MT: { nome: "Mato Grosso", regiao: "Centro-Oeste" },
  MS: { nome: "Mato Grosso do Sul", regiao: "Centro-Oeste" },
  MG: { nome: "Minas Gerais", regiao: "Sudeste" },
  PA: { nome: "Pará", regiao: "Norte" },
  PB: { nome: "Paraíba", regiao: "Nordeste" },
  PR: { nome: "Paraná", regiao: "Sul" },
  PE: { nome: "Pernambuco", regiao: "Nordeste" },
  PI: { nome: "Piauí", regiao: "Nordeste" },
  RJ: { nome: "Rio de Janeiro", regiao: "Sudeste" },
  RN: { nome: "Rio Grande do Norte", regiao: "Nordeste" },
  RS: { nome: "Rio Grande do Sul", regiao: "Sul" },
  RO: { nome: "Rondônia", regiao: "Norte" },
  RR: { nome: "Roraima", regiao: "Norte" },
  SC: { nome: "Santa Catarina", regiao: "Sul" },
  SP: { nome: "São Paulo", regiao: "Sudeste" },
  SE: { nome: "Sergipe", regiao: "Nordeste" },
  TO: { nome: "Tocantins", regiao: "Norte" }
};

export const REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];

/** DDIs mais comuns no uso do WhatsApp na America Latina e Europa. */
export const DDI_PARA_PAIS: Record<string, string> = {
  "1": "Estados Unidos / Canadá",
  "34": "Espanha",
  "351": "Portugal",
  "39": "Itália",
  "44": "Reino Unido",
  "49": "Alemanha",
  "52": "México",
  "54": "Argentina",
  "56": "Chile",
  "57": "Colômbia",
  "58": "Venezuela",
  "51": "Peru",
  "591": "Bolívia",
  "595": "Paraguai",
  "598": "Uruguai",
  "593": "Equador",
  "244": "Angola",
  "258": "Moçambique",
  "81": "Japão",
  "61": "Austrália"
};
