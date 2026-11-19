import Prompt from "../models/Prompt";
import logger from "../utils/logger";

interface TokenUsageData {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * Incrementa os contadores de tokens no registro do Prompt.
 * Aceita o objeto `usage` retornado pela API da OpenAI.
 */
const trackTokenUsage = async (
  promptId: number | undefined | null,
  usage: TokenUsageData | null | undefined
): Promise<void> => {
  if (!promptId || !usage) return;

  try {
    const prompt = await Prompt.findByPk(promptId);
    if (!prompt) return;

    const pTokens = usage.promptTokens || usage["prompt_tokens"] || 0;
    const cTokens = usage.completionTokens || usage["completion_tokens"] || 0;
    const tTokens = usage.totalTokens || usage["total_tokens"] || pTokens + cTokens;

    await prompt.update({
      promptTokens: (prompt.promptTokens || 0) + pTokens,
      completionTokens: (prompt.completionTokens || 0) + cTokens,
      totalTokens: (prompt.totalTokens || 0) + tTokens
    });

    logger.debug(`Token usage tracked for prompt ${promptId}: +${tTokens} tokens`);
  } catch (err) {
    logger.error(`Failed to track token usage for prompt ${promptId}:`, err);
  }
};

export default trackTokenUsage;
