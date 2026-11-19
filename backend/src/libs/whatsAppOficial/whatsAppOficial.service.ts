import axios from "axios";
import { ICreateConnectionWhatsAppOficial, ICreateConnectionWhatsAppOficialWhatsApp, IDataCreateUserApiOficial, IPayloadAPIWhatsAppOficial, IResultTemplates, IReturnConnectionCreateAPIWhatsAppOficial, IReturnCreateCompanyAPIWhatsAppOficial, IReturnMessageMeta, ISendMessageOficial, IUpdateonnectionWhatsAppOficialWhatsApp, IUserApiOficial } from "./IWhatsAppOficial.interfaces";
import fs from 'fs';
import mime from "mime-types";
import FormData from "form-data";

const useOficial = process.env.USE_WHATSAPP_OFICIAL;
const urlApi = process.env.URL_API_OFICIAL;
const token = process.env.TOKEN_API_OFICIAL;

export const sendMessageWhatsAppOficial = async (
    filePath: string,
    token: string,
    data: ISendMessageOficial
): Promise<IReturnMessageMeta> => {

    try {

        checkAPIOficial();


        const formData = new FormData();

        if (filePath) {
            const file = fs.readFileSync(filePath);
            // mime.lookup devolve `false` quando não reconhece a extensão.
            // Passar `false` como contentType quebra o envio; o tipo genérico
            // deixa o servidor decidir, que é melhor do que falhar.
            const mimeType = mime.lookup(filePath) || 'application/octet-stream';
            formData.append('file', file, {
                filename: filePath.split('/').pop(),
                contentType: mimeType
            });
        }

        formData.append('data', JSON.stringify(data));

        // ✅ Timeout para evitar que o envio fique "pendurado" caso a API
        // Oficial não responda (spinner girando para sempre no frontend).
        const res = await axios.post(`${urlApi}/v1/send-message-whatsapp/${token}`, formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 45000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });


        if (res.status == 200 || res.status == 201) return res.data as IReturnMessageMeta;

        throw new Error('Falha em enviar a mensagem para a API da Meta');

    } catch (error) {
    const resStatus = error?.response?.status || 'N/A';
        const resData = error?.response?.data ? JSON.stringify(error.response.data, null, 2) : 'sem response';
        console.error(`[sendMessageWhatsAppOficial] ===== ERRO DETALHADO =====`);
        console.error(`[sendMessageWhatsAppOficial] Status HTTP: ${resStatus}`);
        console.error(`[sendMessageWhatsAppOficial] URL chamada: ${urlApi}/v1/send-message-whatsapp/[TOKEN_REDACTED]`);
        console.error(`[sendMessageWhatsAppOficial] Response body: ${resData}`);
        console.error(`[sendMessageWhatsAppOficial] Payload enviado: ${JSON.stringify(data, null, 2)}`);
        const isTimeout =
            error?.code === "ECONNABORTED" ||
            String(error?.message || "").toLowerCase().includes("timeout");
        const metaErrorMsg = isTimeout
            ? "Tempo de envio esgotado ao falar com a API Oficial do WhatsApp. Tente novamente."
            : error?.response?.data?.error?.message
            || error?.response?.data?.message
            || error?.response?.data?.error
            || error?.message
            || 'erro desconhecido';
        const err = new Error(`Mensagem não enviada para a meta: ${metaErrorMsg}`);
        (err as any).response = { status: error?.response?.status };
        throw err;
    }

}

export const CreateCompanyConnectionOficial = async (data: ICreateConnectionWhatsAppOficial) => {
    try {

        const { company, whatsApp } = data;

        const companySaved = await CreateCompanyWhatsAppOficial(company.companyId, company.companyName);


        const connection = await CreateConnectionWhatsAppOficial(whatsApp);


        const webhookLink = `${urlApi}/v1/webhook/${companySaved.id}/${connection.id}`;

        // salvar o webhook no banco? se for salvar tem que salvar o id da company e o da connection ou somente o link o token do webhook é do mult100
        return { webhookLink, connectionId: connection.id };

    } catch (error) {
        throw new Error(error.message || `Falha ao criar a empresa `);
    }
}

export const checkAPIOficial = () => {
    if (!useOficial || !urlApi || !token) {
        throw new Error('API oficial não configurada. Verifique as variáveis USE_WHATSAPP_OFICIAL, URL_API_OFICIAL e TOKEN_API_OFICIAL.');
    }
}

export const CreateCompanyWhatsAppOficial = async (companyId: string, companyName: string) => {
    try {

        const resCompanies = await axios.get(`${urlApi}/v1/companies`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        // Mesma classe de bug já encontrada em syncTemplatesOficial/metaUnifiedWebhookInfo:
        // se a API Oficial responder 200 sem um array em .data (erro disfarçado de
        // sucesso, formato mudou, etc.), ".find" quebrava com "companies.find is not
        // a function" em vez de um erro claro.
        const companies = Array.isArray(resCompanies.data)
            ? (resCompanies.data as Array<IReturnCreateCompanyAPIWhatsAppOficial>)
            : [];

        const company = companies.find(c => String(c.idEmpresaMult100) == companyId);

        if (!!company) {
            return company
        }

        const res = await axios.post(`${urlApi}/v1/companies`, {
            idEmpresaMult100: +companyId,
            name: companyName
        },
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (res.status == 200 || res.status == 201) {
            const data = res.data as IReturnCreateCompanyAPIWhatsAppOficial;
            return data;
        }

        throw new Error('Falha em criar a empresa na API Oficial do WhatsApp');

    } catch (error) {
        throw new Error(error.message || `Não foi possível criar a empresa na API Oficial do WhatsApp`);
    }
}

export const CreateConnectionWhatsAppOficial = async (data: ICreateConnectionWhatsAppOficialWhatsApp) => {
    try {

        const res = await axios.post(`${urlApi}/v1/whatsapp-oficial`, { ...data },
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (res.status == 200 || res.status == 201) {
            const data = res.data as IReturnConnectionCreateAPIWhatsAppOficial;
            return data;
        }

        throw new Error(res.data.message || 'Falha em criar a empresa na API Oficial do WhatsApp');

    } catch (error) {
        throw new Error(error.message || `Não foi possível criar a empresa na API Oficial do WhatsApp`);
    }
}

export const UpdateConnectionWhatsAppOficial = async (idWhatsApp: number, data: IUpdateonnectionWhatsAppOficialWhatsApp) => {
    try {
        const res = await axios.put(`${urlApi}/v1/whatsapp-oficial/${idWhatsApp}`, { ...data },
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (res.status == 200 || res.status == 201) {
            const data = res.data as IReturnConnectionCreateAPIWhatsAppOficial;
            return data;
        }

        throw new Error(res.data.message || 'Falha em criar a empresa na API Oficial do WhatsApp');

    } catch (error) {
        throw new Error(error.message || `Não foi possível atualizar a empresa na API Oficial do WhatsApp`);
    }
}

export const DeleteConnectionWhatsAppOficial = async (idWhatsapp: number) => {
    try {
        const res = await axios.delete(`${urlApi}/v1/whatsapp-oficial/${idWhatsapp}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (res.status == 200 || res.status == 201) {
            const data = res.data as IReturnConnectionCreateAPIWhatsAppOficial;
            return data;
        }

        throw new Error(res.data.message || 'Falha em criar a empresa na API Oficial do WhatsApp');

    } catch (error) {
        throw new Error(error.message || `Não foi possível deletar a empresa na API Oficial do WhatsApp`);
    }
}

export const getTemplatesWhatsAppOficial = async (multi100_token: string) => {
    try {
        const res = await axios.get(`${urlApi}/v1/templates-whatsapp/${multi100_token}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (res.status == 200 || res.status == 201) {
            const data = res.data as IResultTemplates;
            return data;
        }

        throw new Error(res.data.message || 'Falha em listar os templates da API Oficial do WhatsApp');

    } catch (error) {
        const errDetail = error?.response?.data
            ? JSON.stringify(error.response.data)
            : error?.message || "sem detalhes";

        const errorMsg =
            error?.response?.data?.message ||
            error?.response?.data?.error ||
            error?.message ||
            `Falha em listar os templates da API Oficial do WhatsApp`;

        // Propagar indicador de token expirado
        if (errorMsg.includes('TOKEN_EXPIRED') || error?.response?.status === 401) {
            throw new Error('TOKEN_EXPIRED: O token de acesso da Meta expirou ou é inválido. Atualize o token na configuração da conexão.');
        }

        throw new Error(errorMsg);
    }
}

export const createTemplateWhatsAppOficial = async (
    multi100_token: string,
    templateData: {
        name: string;
        language: string;
        category: string;
        components: Array<any>;
    }
) => {
    try {
        const res = await axios.post(
            `${urlApi}/v1/templates-whatsapp/${multi100_token}`,
            templateData,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (res.status == 200 || res.status == 201) {
            return res.data;
        }

        throw new Error(res.data.message || 'Falha em criar o template na API Oficial do WhatsApp');
    } catch (error) {
        const errorMsg = error?.response?.data?.message || error.message || 'Falha em criar o template na API Oficial do WhatsApp';
        if (errorMsg.includes('TOKEN_EXPIRED') || error?.response?.status === 401) {
            throw new Error('TOKEN_EXPIRED: O token de acesso da Meta expirou ou é inválido. Atualize o token na configuração da conexão.');
        }
        throw new Error(errorMsg);
    }
}

export const deleteTemplateWhatsAppOficial = async (
    multi100_token: string,
    templateName: string
) => {
    try {
        const res = await axios.delete(
            `${urlApi}/v1/templates-whatsapp/${multi100_token}/${templateName}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (res.status == 200 || res.status == 201) {
            return res.data;
        }

        throw new Error(res.data.message || 'Falha em deletar o template na API Oficial do WhatsApp');
    } catch (error) {
        const errorMsg = error?.response?.data?.message || error.message || 'Falha em deletar o template na API Oficial do WhatsApp';
        if (errorMsg.includes('TOKEN_EXPIRED') || error?.response?.status === 401) {
            throw new Error('TOKEN_EXPIRED: O token de acesso da Meta expirou ou é inválido. Atualize o token na configuração da conexão.');
        }
        throw new Error(errorMsg);
    }
}

export const setReadMessageWhatsAppOficial = async (token: string, messageId: string) => {
    try {

        const res = await axios.post(`${urlApi}/v1/send-message-whatsapp/read-message/${token}/${messageId}`,

        );

        if (res.status == 200 || res.status == 201) {
            const data = res.data as { success: string };
            return data;
        }

        throw new Error(res.data.message || 'Falha em marcar a mensagem como lida API Oficial do WhatsApp');

    } catch (error) {
        throw new Error(error.message || `Falha em marcar a mensagem como lida API Oficial do WhatsApp`);
    }
}