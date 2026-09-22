import { describe, expect, it } from "vitest";
import { parseAppConfig } from "../src/config";

describe("parseAppConfig", () => {
  it("normalizes valid configuration", () => {
    expect(
      parseAppConfig({
        TELEGRAM_BOT_USERNAME: "@Example_Bot",
        TELEGRAM_ALLOWED_USER_ID: "12345",
        OPENAI_COMPATIBLE_BASE_URL: "https://provider.example/api/",
        OPENAI_COMPATIBLE_MODEL: " model-name ",
        APP_NAME: " hermeset ",
      }),
    ).toEqual({
      telegramBotUsername: "Example_Bot",
      telegramAllowedUserId: 12345,
      openaiCompatibleBaseUrl: "https://provider.example/api",
      openaiCompatibleModel: "model-name",
      appName: "hermeset",
    });
  });

  it("uses the default app name", () => {
    expect(
      parseAppConfig({
        TELEGRAM_BOT_USERNAME: "hermeset_bot",
        TELEGRAM_ALLOWED_USER_ID: "1",
        OPENAI_COMPATIBLE_BASE_URL: "https://provider.example/v1",
        OPENAI_COMPATIBLE_MODEL: "model",
      }).appName,
    ).toBe("hermeset");
  });

  it.each(["0", "-1", "1.5", "1e3", "not-a-number"])(
    "rejects invalid allowed user ID %s",
    (userId) => {
      expect(() =>
        parseAppConfig({
          TELEGRAM_BOT_USERNAME: "hermeset_bot",
          TELEGRAM_ALLOWED_USER_ID: userId,
          OPENAI_COMPATIBLE_BASE_URL: "https://provider.example/v1",
          OPENAI_COMPATIBLE_MODEL: "model",
        }),
      ).toThrow(/positive integer/);
    },
  );

  it("rejects non-HTTP provider URLs", () => {
    expect(() =>
      parseAppConfig({
        TELEGRAM_BOT_USERNAME: "hermeset_bot",
        TELEGRAM_ALLOWED_USER_ID: "1",
        OPENAI_COMPATIBLE_BASE_URL: "file:///tmp/model",
        OPENAI_COMPATIBLE_MODEL: "model",
      }),
    ).toThrow(/http or https/);
  });
});
