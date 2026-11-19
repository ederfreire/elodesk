import CallHistory from "../../models/CallHistory";

interface CallHistorical {
    user_id: number;
    token_wavoip: string;
    whatsapp_id?: number;
    contact_id?: number;
    company_id?: number;
    phone_to: string;
    name: string;
    url?: string;
    status?: string;
    direction?: string;
    duration?: number;
}

const createCallHistorical = async (body: CallHistorical) => {
    try {
        return await CallHistory.create(body as any);
    } catch (error) {
        throw new Error(error);
    }
}

export default createCallHistorical;
