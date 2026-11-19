/** 
 * @TercioSantos-1 |
 * api/get/todas as configurações de 1 empresa |
 * api/get/1 configuração específica |
 * api/put/atualização de 1 configuração |
 */
import api from "../../services/api";

/**
 * CACHE E DEDUPLICACAO DO `get`
 *
 * A analise de um refresh mostrou 24 chamadas a `/companySettingOne` num
 * unico carregamento — 10 delas para a MESMA coluna
 * (`enableCloseTicketModal`). Cada componente que precisa de uma configuracao
 * faz o proprio pedido, sem saber que outro ja pediu o mesmo.
 *
 * Com HTTP/1.1 o navegador so mantem 6 conexoes por dominio, entao essas
 * chamadas repetidas nao sao so desperdicio: ocupam fila e empurram para tras
 * as requisicoes que importam.
 *
 * A correcao fica AQUI DENTRO, e nao nos pontos de chamada. Sao dezenas de
 * componentes usando `get({ column })`; mexer em todos seria arriscado. Como
 * a assinatura nao muda, nenhum deles precisa saber que existe cache.
 *
 * Duas camadas:
 *   1. `emAndamento` — se a mesma coluna ja esta sendo buscada, o segundo
 *      chamador recebe a MESMA promise. E o que colapsa a rajada da montagem.
 *   2. `cache` — resposta guardada por 60s. Configuracao de empresa quase nao
 *      muda durante uma sessao, e 60s e curto o bastante para uma alteracao
 *      aparecer logo.
 *
 * O `update` limpa o cache, entao salvar reflete na hora.
 */
const VALIDADE_MS = 60000;

const cache = new Map();
const emAndamento = new Map();

const chaveDe = params => `${params?.column || ""}|${params?.companyId || ""}`;

/** Limpa tudo. Chamado apos qualquer gravacao. */
export const limparCacheDeConfiguracoes = () => {
  cache.clear();
  emAndamento.clear();
};

const useCompanySettings = () => {

    const getAll = async (companyId) => {
        const { data } = await api.request({
            url: `/companySettings/${companyId}`,
            method: 'GET'
        });

        return data;
    }

   const get = async (params) => {
        const chave = chaveDe(params);

        const guardado = cache.get(chave);
        if (guardado && Date.now() - guardado.em < VALIDADE_MS) {
            return guardado.valor;
        }

        // Ja existe um pedido igual no ar: aproveita o mesmo em vez de abrir
        // outro.
        const pendente = emAndamento.get(chave);
        if (pendente) return pendente;

        const promessa = api
            .request({
                url: '/companySettingOne',
                method: 'GET',
                params
            })
            .then(({ data }) => {
                cache.set(chave, { valor: data, em: Date.now() });
                return data;
            })
            .finally(() => {
                // Sai dos pendentes em qualquer desfecho; preso apos um erro,
                // a coluna nunca mais seria buscada.
                emAndamento.delete(chave);
            });

        emAndamento.set(chave, promessa);
        return promessa;
    } 

    const update = async (data) => {
        const { data: responseData } = await api.request({
            url: '/companySettings',
            method: 'PUT',
            data
        });

        // Sem isso, salvar uma configuracao mostraria o valor antigo ate o
        // cache expirar.
        limparCacheDeConfiguracoes();

        return responseData;
    }

    return {
        getAll,
        get,
        update
    }
}

export default useCompanySettings;