export const AI_PROVIDERS = ["gemini", "openai", "huggingface", "anthropic"] as const;

export type AIProvider = (typeof AI_PROVIDERS)[number];

export const DEFAULT_AI_PROVIDER: AIProvider = "openai";

export const AI_PROVIDER_OPTIONS = [
  {
    value: "gemini",
    label: "Gemini 2.5 Flash",
    description: "Fast resume parsing and analysis with Gemini 2.5 Flash.",
  },
  {
    value: "openai",
    label: "OpenAI GPT-5.4",
    description: "Default provider using GPT-5.4 for resume parsing and analysis.",
  },
  {
    value: "huggingface",
    label: "Hugging Face",
    description: "Use a Hugging Face router model for text-based resume parsing and analysis.",
  },
  {
    value: "anthropic",
    label: "Anthropic Claude",
    description: "Streaming resume parsing and analysis with Claude (Opus 4.8 by default).",
  },
] as const satisfies ReadonlyArray<{
  value: AIProvider;
  label: string;
  description: string;
}>;

export function isAIProvider(value: unknown): value is AIProvider {
  return (
    typeof value === "string" &&
    AI_PROVIDERS.includes(value as AIProvider)
  );
}

export function normalizeAIProvider(value: unknown): AIProvider {
  const normalizedValue =
    typeof value === "string" ? value.trim().toLowerCase() : "";

  return isAIProvider(normalizedValue)
    ? normalizedValue
    : DEFAULT_AI_PROVIDER;
}
