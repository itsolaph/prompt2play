import { fallbackLevel, proceduralLevel, type Generated } from "./generate.ts";
import { llmLevelWithRepair, type RepairOptions } from "./llm.ts";

export async function generateWith(
  sentence: string,
  { apiKey, model, attempts, fetchImpl }: RepairOptions & { apiKey?: string; model: string },
): Promise<Generated> {
  if (apiKey) {
    const result = await llmLevelWithRepair(sentence, apiKey, model, { attempts, fetchImpl });
    if (result.failures.length) console.warn(result.failures.join(", "));
    if (result.level) return result.level;
  }
  try {
    return proceduralLevel(sentence);
  } catch {
    return fallbackLevel("Fallback level");
  }
}
