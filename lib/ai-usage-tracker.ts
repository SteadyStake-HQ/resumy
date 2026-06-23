import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { AIUsage } from "@/lib/ai-usage";

export type AIUsageAccumulator = AIUsage;

type UsageRecord = {
  provider: "openai" | "anthropic" | "gemini" | "huggingface";
  inputTokens?: number | null;
  outputTokens?: number | null;
};

const usageStorage = new AsyncLocalStorage<AIUsageAccumulator>();
const DEFAULT_RATES_PER_MILLION = {
  openai: { input: 2.5, output: 15 },
  anthropic: { input: 5, output: 25 },
  gemini: { input: 0.3, output: 2.5 },
  huggingface: { input: 0.05, output: 0.05 },
} as const;

function tokenCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function getRate(provider: UsageRecord["provider"], kind: "input" | "output") {
  const envName = `AI_PRICE_${provider.toUpperCase()}_${kind.toUpperCase()}_PER_MILLION`;
  const configured = Number(process.env[envName]);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_RATES_PER_MILLION[provider][kind];
}

export function createAIUsageAccumulator(): AIUsageAccumulator {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, calls: 0 };
}

export function runWithAIUsage<T>(accumulator: AIUsageAccumulator, operation: () => Promise<T>) {
  return usageStorage.run(accumulator, operation);
}

export function recordAIUsage(record: UsageRecord) {
  const accumulator = usageStorage.getStore();
  if (!accumulator) return;
  const inputTokens = tokenCount(record.inputTokens);
  const outputTokens = tokenCount(record.outputTokens);
  accumulator.inputTokens += inputTokens;
  accumulator.outputTokens += outputTokens;
  accumulator.totalTokens += inputTokens + outputTokens;
  accumulator.estimatedCostUsd +=
    (inputTokens * getRate(record.provider, "input") + outputTokens * getRate(record.provider, "output")) /
    1_000_000;
  accumulator.calls += 1;
}
