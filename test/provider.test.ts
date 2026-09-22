import { describe, expect, it } from "vitest";
import {
  resolveProviderConfig,
  type ProviderConfig,
} from "../src/provider";

describe("resolveProviderConfig", () => {
  it("normalizes a custom OpenAI-compatible provider", () => {
    expect(
      resolveProviderConfig({
        OPENAI_COMPATIBLE_API_KEY: " secret ",
        OPENAI_COMPATIBLE_BASE_URL: "https://provider.example/v1///",
        OPENAI_COMPATIBLE_MODEL: " model ",
      }),
    ).toEqual({
      apiKey: "secret",
      baseUrl: "https://provider.example/v1",
      model: "model",
    });
  });

  it.each(["OPENAI_COMPATIBLE_API_KEY", "OPENAI_COMPATIBLE_BASE_URL", "OPENAI_COMPATIBLE_MODEL"])(
    "requires %s",
    (key) => {
      expect(() =>
        resolveProviderConfig({
          OPENAI_COMPATIBLE_API_KEY: "key",
          OPENAI_COMPATIBLE_BASE_URL: "https://provider.example/v1",
          OPENAI_COMPATIBLE_MODEL: "model",
          [key]: undefined,
        }),
      ).toThrow();
    },
  );
});

describe("provider model factory", () => {
  it("creates a LanguageModel without hard-coding a provider URL", () => {
    const config: ProviderConfig = {
      apiKey: "test-key",
      baseUrl: "https://provider.example/v1",
      model: "test-model",
    };
    const { createProviderModel } = require("../src/provider") as typeof import("../src/provider");
    const model = createProviderModel(config);
    expect(model.modelId).toBe("test-model");
  });
});
