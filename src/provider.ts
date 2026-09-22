import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export type ProviderEnvironment = Readonly<
  Record<"OPENAI_COMPATIBLE_API_KEY" | "OPENAI_COMPATIBLE_BASE_URL" | "OPENAI_COMPATIBLE_MODEL", string | undefined>
>;

function requiredSecret(value: string | undefined): string {
  const secret = value?.trim() ?? "";
  if (!secret) {
    throw new Error("OPENAI_COMPATIBLE_API_KEY is required");
  }
  return secret;
}

function normalizedBaseUrl(value: string | undefined): string {
  const raw = value?.trim().replace(/\/+$/, "") ?? "";
  if (!raw) {
    throw new Error("OPENAI_COMPATIBLE_BASE_URL is required");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("OPENAI_COMPATIBLE_BASE_URL must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      "OPENAI_COMPATIBLE_BASE_URL must use the http or https protocol",
    );
  }
  return parsed.toString().replace(/\/$/, "");
}

export function resolveProviderConfig(
  environment: ProviderEnvironment,
): ProviderConfig {
  const model = environment.OPENAI_COMPATIBLE_MODEL?.trim() ?? "";
  if (!model) {
    throw new Error("OPENAI_COMPATIBLE_MODEL is required");
  }
  return {
    apiKey: requiredSecret(environment.OPENAI_COMPATIBLE_API_KEY),
    baseUrl: normalizedBaseUrl(environment.OPENAI_COMPATIBLE_BASE_URL),
    model,
  };
}

export function createProviderModel(
  config: ProviderConfig,
): LanguageModel {
  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
  return provider(config.model);
}
