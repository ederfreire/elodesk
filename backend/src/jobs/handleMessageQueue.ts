import { getWbot } from "../libs/wbot";
import { handleMessage } from "../services/WbotServices/wbotMessageListener";

export default {
    key: `${process.env.DB_NAME}-handleMessage`,

    async handle({ data }) {
        try {
            const { message, wbot, companyId } = data;


            const w = getWbot(wbot);


            try {
                await handleMessage(message, w, companyId);
            } catch (error) {
            }
        } catch (error) {
        }
    },
};

