import { Op } from "sequelize";
import Contact from "../../models/Contact";
import {
  DDD_PARA_UF,
  UF_INFO,
  REGIOES,
  DDI_PARA_PAIS
} from "../../helpers/DddBrasil";

interface Params {
  companyId: number;
  startDate?: string;
  endDate?: string;
}

interface Resultado {
  total: number;
  mapeados: number;
  naoMapeados: number;
  regioes: { regiao: string; total: number }[];
  estados: { uf: string; nome: string; regiao: string; total: number }[];
  paises: { ddi: string; nome: string; total: number }[];
  contatos: {
    id: number;
    name: string;
    number: string;
    uf: string | null;
    estado: string | null;
    regiao: string | null;
    pais: string | null;
  }[];
}

/**
 * Distribuição geográfica dos contatos, inferida do DDD/DDI do número.
 *
 * A leitura é feita em memória e não em SQL de propósito: extrair DDD de um
 * número exige tratar 8 e 9 dígitos, DDI 55 presente ou ausente e lixo de
 * formatação. Em SQL isso vira um `substring`/`regexp_replace` aninhado que
 * ninguém consegue revisar; aqui a regra fica legível e testável.
 *
 * A consulta traz só a coluna `number`, então o custo é baixo mesmo com
 * dezenas de milhares de contatos.
 */
const GeoDistributionService = async ({
  companyId,
  startDate,
  endDate
}: Params): Promise<Resultado> => {
  const where: any = { companyId };

  if (startDate && endDate) {
    where.createdAt = {
      [Op.between]: [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
    };
  }

  const contatos = await Contact.findAll({
    where,
    // `id` e `name` entram para a lista de contatos da tela. Continua sendo
    // uma consulta de poucas colunas — nada de includes.
    attributes: ["id", "name", "number", "isGroup"],
    order: [["name", "ASC"]]
  });

  const porUf = new Map<string, number>();
  const porPais = new Map<string, number>();

  // Lista dos contatos com o local inferido, para a tabela da tela.
  const lista: {
    id: number;
    name: string;
    number: string;
    uf: string | null;
    estado: string | null;
    regiao: string | null;
    pais: string | null;
  }[] = [];
  let mapeados = 0;
  let total = 0;

  contatos.forEach(contato => {
    // Grupo não é pessoa e o "número" dele é um id de grupo: entraria como
    // DDD inválido e inflaria o "não mapeados".
    if (contato.isGroup) return;

    const numero = String(contato.number || "").replace(/\D/g, "");
    if (!numero) return;

    total += 1;

    // Brasil: com DDI (55 + DDD + 8 ou 9 dígitos) ou sem (DDD + 8 ou 9).
    let ddd: string | null = null;

    if (numero.startsWith("55") && (numero.length === 12 || numero.length === 13)) {
      // Com DDI 55 explícito não há ambiguidade.
      ddd = numero.substring(2, 4);
    } else if (numero.length === 11 && numero[2] === "9") {
      // Sem DDI, 11 dígitos colidem com número dos EUA (+1 + 10 dígitos):
      // "14155552671" tem DDD "14" válido (SP) e viraria Brasil por engano.
      // Celular brasileiro de 11 dígitos SEMPRE tem 9 na terceira posição,
      // então esse teste separa os dois casos.
      ddd = numero.substring(0, 2);
    } else if (numero.length === 10 && "2345".includes(numero[2])) {
      // Fixo brasileiro: o primeiro dígito do assinante vai de 2 a 5.
      ddd = numero.substring(0, 2);
    }

    if (ddd && DDD_PARA_UF[ddd]) {
      const uf = DDD_PARA_UF[ddd];
      porUf.set(uf, (porUf.get(uf) || 0) + 1);
      mapeados += 1;
      lista.push({
        id: contato.id,
        name: contato.name,
        number: contato.number,
        uf,
        estado: UF_INFO[uf]?.nome || uf,
        regiao: UF_INFO[uf]?.regiao || null,
        pais: "Brasil"
      });
      return;
    }

    // Fora do Brasil: tenta os DDIs conhecidos, do mais longo para o mais
    // curto — "1" casaria com "351" se testado primeiro.
    // Chega aqui quem não passou no teste de Brasil acima.
    if (!numero.startsWith("55")) {
      const ddis = Object.keys(DDI_PARA_PAIS).sort(
        (a, b) => b.length - a.length
      );
      const achado = ddis.find(d => numero.startsWith(d));
      if (achado) {
        porPais.set(achado, (porPais.get(achado) || 0) + 1);
        mapeados += 1;
        lista.push({
          id: contato.id,
          name: contato.name,
          number: contato.number,
          uf: null,
          estado: null,
          regiao: null,
          pais: DDI_PARA_PAIS[achado]
        });
        return;
      }
    }

    // Nao identificado: entra na lista assim mesmo, porque o operador precisa
    // saber QUAIS contatos ficaram de fora para corrigir o cadastro.
    lista.push({
      id: contato.id,
      name: contato.name,
      number: contato.number,
      uf: null,
      estado: null,
      regiao: null,
      pais: null
    });
  });

  const estados = Array.from(porUf.entries())
    .map(([uf, qtd]) => ({
      uf,
      nome: UF_INFO[uf]?.nome || uf,
      regiao: UF_INFO[uf]?.regiao || "—",
      total: qtd
    }))
    .sort((a, b) => b.total - a.total);

  // Todas as regiões sempre presentes, inclusive as zeradas: o mapa precisa
  // desenhar as cinco, e uma região ausente do payload viraria buraco.
  const regioes = REGIOES.map(regiao => ({
    regiao,
    total: estados
      .filter(e => e.regiao === regiao)
      .reduce((soma, e) => soma + e.total, 0)
  }));

  const paises = Array.from(porPais.entries())
    .map(([ddi, qtd]) => ({
      ddi,
      nome: DDI_PARA_PAIS[ddi] || `+${ddi}`,
      total: qtd
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total,
    mapeados,
    naoMapeados: total - mapeados,
    regioes,
    estados,
    paises,
    contatos: lista
  };
};

export default GeoDistributionService;
