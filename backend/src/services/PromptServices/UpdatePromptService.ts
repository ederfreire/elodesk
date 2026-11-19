import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Prompt from "../../models/Prompt";
import ShowPromptService from "./ShowPromptService";

interface PromptData {
    id?: number;
    name: string;
    apiKey: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    queueId?: number;
    maxMessages?: number;
    companyId: string | number;
    voice?: string;
    voiceKey?: string;
    voiceRegion?: string;
    agentFunction?: string;
    voiceTone?: string;
    aiModel?: string;
    languages?: string | string[];
    personality?: string;
    active?: boolean;
    greetingMessage?: string;
    responseRules?: string;
    allowTransfer?: boolean;
    transferKeywords?: string;
    transferMessage?: string;
    transferQueueId?: number | null;
    transferUserId?: number | null;
    transferStatus?: string;
    responseDelay?: number;
    charLimit?: number;
    humanizeConversation?: boolean;
    audioEnabled?: boolean;
    transcribeAudio?: boolean;
    responseMode?: string;
    agentVoice?: string;
    sendAsPTT?: boolean;
    toolOpenTicket?: boolean;
    toolOpenTicketConfig?: string | Record<string, any>;
    toolNotifyHuman?: boolean;
    toolNotifyHumanConfig?: string | Record<string, any>;
    toolHttpRequest?: boolean;
    toolHttpRequestConfig?: string | Record<string, any>;
    toolScheduling?: boolean;
    toolSchedulingConfig?: string | Record<string, any>;
    toolTags?: boolean;
    toolTagsConfig?: string | Record<string, any>;
    toolKanban?: boolean;
    toolKanbanConfig?: string | Record<string, any>;
    workingHoursEnabled?: boolean;
    workingHoursTimezone?: string;
    workingHoursOutOfMessage?: string;
    workingHoursSchedule?: string | Record<string, any>;
    inactivityEnabled?: boolean;
    inactivityTimeout?: number;
    inactivityMessage?: string;
    inactivityMaxReminders?: number;
    inactivitySteps?: any;
}

interface Request {
    promptData: PromptData;
    promptId: string | number;
    companyId: string | number;
}

const normalizeOptionalNumber = (value: any): number | null => {
    if (value === "" || value === undefined || value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const UpdatePromptService = async ({
    promptId,
    promptData,
    companyId
}: Request): Promise<Prompt | undefined> => {
    const promptTable = await ShowPromptService({ promptId, companyId });

    promptData.transferQueueId = normalizeOptionalNumber(promptData.transferQueueId);
    promptData.transferUserId = normalizeOptionalNumber(promptData.transferUserId);

    // Serialize languages array to JSON string if needed
    if (promptData.languages && Array.isArray(promptData.languages)) {
        promptData.languages = JSON.stringify(promptData.languages);
    }

    // Serialize tool configs to JSON string if needed
    if (promptData.toolNotifyHumanConfig && typeof promptData.toolNotifyHumanConfig === "object") {
        promptData.toolNotifyHumanConfig = JSON.stringify(promptData.toolNotifyHumanConfig);
    }
    if (promptData.toolHttpRequestConfig && typeof promptData.toolHttpRequestConfig === "object") {
        promptData.toolHttpRequestConfig = JSON.stringify(promptData.toolHttpRequestConfig);
    }
    if (promptData.toolOpenTicketConfig && typeof promptData.toolOpenTicketConfig === "object") {
        promptData.toolOpenTicketConfig = JSON.stringify(promptData.toolOpenTicketConfig);
    }
    if (promptData.toolSchedulingConfig && typeof promptData.toolSchedulingConfig === "object") {
        promptData.toolSchedulingConfig = JSON.stringify(promptData.toolSchedulingConfig);
    }
    if (promptData.toolTagsConfig && typeof promptData.toolTagsConfig === "object") {
        promptData.toolTagsConfig = JSON.stringify(promptData.toolTagsConfig);
    }
    if (promptData.toolKanbanConfig && typeof promptData.toolKanbanConfig === "object") {
        promptData.toolKanbanConfig = JSON.stringify(promptData.toolKanbanConfig);
    }
    if (promptData.workingHoursSchedule && typeof promptData.workingHoursSchedule === "object") {
        promptData.workingHoursSchedule = JSON.stringify(promptData.workingHoursSchedule);
    }

    const promptSchema = Yup.object().shape({
        name: Yup.string().required("ERR_PROMPT_NAME_INVALID"),
        prompt: Yup.string().nullable(),
        apiKey: Yup.string().nullable(),
        queueId: Yup.number().nullable(),
        maxMessages: Yup.number().nullable()
    });

    const {
        name, apiKey, prompt, maxTokens, temperature, promptTokens,
        completionTokens, totalTokens, queueId, maxMessages, voice,
        voiceKey, voiceRegion, agentFunction, voiceTone, aiModel,
        languages, personality, active, greetingMessage, responseRules,
        allowTransfer, transferKeywords, transferMessage, responseDelay,
        transferQueueId, transferUserId, transferStatus,
        charLimit, humanizeConversation, audioEnabled, transcribeAudio,
        responseMode, agentVoice, sendAsPTT,
        toolOpenTicket, toolOpenTicketConfig,
        toolNotifyHuman, toolNotifyHumanConfig,
        toolHttpRequest, toolHttpRequestConfig,
        toolScheduling, toolSchedulingConfig,
        toolTags, toolTagsConfig,
        toolKanban, toolKanbanConfig,
        workingHoursEnabled, workingHoursTimezone,
        workingHoursOutOfMessage, workingHoursSchedule,
        inactivityEnabled, inactivityTimeout, inactivityMessage, inactivityMaxReminders,
        inactivitySteps
    } = promptData;

    try {
        await promptSchema.validate({ name, apiKey, prompt, maxTokens, temperature, queueId, maxMessages });
    } catch (err) {
        throw new AppError(`${JSON.stringify(err, undefined, 2)}`);
    }

    await promptTable.update({
        name, apiKey, prompt, maxTokens, temperature, promptTokens,
        completionTokens, totalTokens, queueId, maxMessages, voice,
        voiceKey, voiceRegion, agentFunction, voiceTone, aiModel,
        languages, personality, active, greetingMessage, responseRules,
        allowTransfer, transferKeywords, transferMessage, responseDelay,
        transferQueueId, transferUserId, transferStatus,
        charLimit, humanizeConversation, audioEnabled, transcribeAudio,
        responseMode, agentVoice, sendAsPTT,
        toolOpenTicket, toolOpenTicketConfig,
        toolNotifyHuman, toolNotifyHumanConfig,
        toolHttpRequest, toolHttpRequestConfig,
        toolScheduling, toolSchedulingConfig,
        toolTags, toolTagsConfig,
        toolKanban, toolKanbanConfig,
        workingHoursEnabled, workingHoursTimezone,
        workingHoursOutOfMessage, workingHoursSchedule,
        inactivityEnabled, inactivityTimeout, inactivityMessage, inactivityMaxReminders,
        inactivitySteps
    });
    await promptTable.reload();
    return promptTable;
};

export default UpdatePromptService;
