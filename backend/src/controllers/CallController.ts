import { Request, Response } from "express";
import createCallHistorical from "../services/CallService/CreateCallService";
import getHistorical from "../services/CallService/GetCallService";
import GetWhatsappUserId from "../services/CallService/GetWhatsappUserId";
import CallHistory from "../models/CallHistory";
import { getIO } from "../libs/socket";

interface CallHistorical {
    user_id: number;
    token_wavoip: string;
    whatsapp_id: number;
    contact_id: number;
    company_id: number;
    phone_to: string;
    name: string;
    url: string;
    status?: string;
    direction?: string;
    duration?: number;
}

export const createCallHistoric = async (req: Request, res: Response): Promise<Response> => {
    try {
        const body = req.body as CallHistorical;
        // Inject authenticated user_id and company_id from token
        body.user_id = parseInt(req.user.id);
        body.company_id = body.company_id || req.user.companyId;

        const callHistorical = await createCallHistorical(body);
        try {
            const io = getIO();
            io.of(String(body.company_id)).emit(`company-${body.company_id}-call-history`, {
                action: "create",
                call: callHistorical
            });
        } catch (socketError: any) {
            console.warn("createCallHistoric socket warn:", socketError?.message);
        }
        return res.status(200).json({ callHistorical });
    } catch (error: any) {
        console.error("createCallHistoric error:", error?.message);
        return res.status(500).json({ error: error?.message });
    }
};

export const updateCallHistoric = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { id } = req.params;
        const { status, duration, direction, url } = req.body;

        const call = await CallHistory.findOne({ where: { id, company_id: req.user.companyId } });
        if (!call) {
            return res.status(404).json({ error: "Registro não encontrado" });
        }

        if (status) call.status = status;
        if (duration !== undefined) call.duration = duration;
        if (direction) call.direction = direction;
        if (url) call.url = url;

        await call.save();

        try {
            const io = getIO();
            io.of(String(call.company_id)).emit(`company-${call.company_id}-call-history`, {
                action: "update",
                call
            });
        } catch (socketError: any) {
            console.warn("updateCallHistoric socket warn:", socketError?.message);
        }

        return res.status(200).json({ call });
    } catch (error: any) {
        console.error("updateCallHistoric error:", error?.message);
        return res.status(500).json({ error: error?.message });
    }
};

export const getHistoric = async (req: Request, res: Response) => {
    try {
        const showAll = req.query.showAll === "true";
        const historical = await getHistorical({
            "user_id": parseInt(req.user.id),
            "company_id": req.user.companyId,
            "showAll": showAll,
            "dateStart": req.query.dateStart as string,
            "dateEnd": req.query.dateEnd as string,
        });

        return res.status(200).json({ historical });
    } catch (error: any) {
        const msg = error?.message || String(error);
        console.error('getHistoric error:', msg);
        return res.status(200).json({
            historical: { resultFinal: [], total: 0, totalReject: 0, totalServed: 0, totalFinish: 0 },
            warning: msg
        });
    }
}

export const getWhatsappUserId = async (req: Request, res: Response): Promise<Response> => {
    const userId = parseInt(req.user.id);
    
    const result = await GetWhatsappUserId(userId);
    
    const wppList = result?.whatsapps || [];
    
    return res.status(200).json(result);
};
