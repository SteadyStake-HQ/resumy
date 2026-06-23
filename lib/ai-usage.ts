export type AIUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  calls: number;
};

function finiteNonNegative(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

export function normalizeAIUsage(value: unknown): AIUsage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const inputTokens = finiteNonNegative(record.inputTokens);
  const outputTokens = finiteNonNegative(record.outputTokens);
  const totalTokens = finiteNonNegative(record.totalTokens) || inputTokens + outputTokens;
  const estimatedCostUsd = Number(record.estimatedCostUsd);
  const calls = finiteNonNegative(record.calls);
  if (!totalTokens && !calls) return null;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: Number.isFinite(estimatedCostUsd) && estimatedCostUsd >= 0 ? estimatedCostUsd : 0,
    calls,
  };
}

export function mergeAIUsage(...values: unknown[]): AIUsage | null {
  const entries = values.map(normalizeAIUsage).filter((value): value is AIUsage => Boolean(value));
  if (!entries.length) return null;
  return entries.reduce<AIUsage>(
    (total, value) => ({
      inputTokens: total.inputTokens + value.inputTokens,
      outputTokens: total.outputTokens + value.outputTokens,
      totalTokens: total.totalTokens + value.totalTokens,
      estimatedCostUsd: total.estimatedCostUsd + value.estimatedCostUsd,
      calls: total.calls + value.calls,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, calls: 0 },
  );
}

export function formatAIUsageCost(cost: number) {
  if (cost === 0) return "$0.0000";
  if (cost < 0.0001) return "<$0.0001";
  return `$${cost.toFixed(cost < 0.01 ? 4 : 2)}`;
}
