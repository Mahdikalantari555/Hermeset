export interface AppConfig {
  telegramBotUsername: string;
  telegramAllowedUserId: number;
  openaiCompatibleBaseUrl: string;
  openaiCompatibleModel: string;
  appName: string;
}

export type NonSecretEnvironment = Readonly<
  Partial<Record<keyof AppConfig, string>>
>;

const DEFAULT_APP_NAME = "hermeset";

function requiredText(
  value: string | undefined,
  name: string,
): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized;
}

function normalizeBaseUrl(value: string | undefined): string {
  const raw = requiredText(value, "OPENAI_COMPATIBLE_BASE_URL").replace(
    /\/+$/,
    "",
  );
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
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      "OPENAI_COMPATIBLE_BASE_URL must not contain credentials, a query, or a fragment",
    );
  }
  return parsed.toString().replace(/\/$/, "");
}

function normalizeAllowedUserId(value: string | undefined): number {
  const raw = requiredText(value, "TELEGRAM_ALLOWED_USER_ID");
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error("TELEGRAM_ALLOWED_USER_ID must be a positive integer");
  }
  const userId = Number(raw);
  if (!Number.isSafeInteger(userId)) {
    throw new Error("TELEGRAM_ALLOWED_USER_ID must be a safe integer");
  }
  return userId;
}

function normalizeBotUsername(value: string | undefined): string {
  const username = requiredText(value, "TELEGRAM_BOT_USERNAME").replace(
    /^@+/,
    "",
  );
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    throw new Error(
      "TELEGRAM_BOT_USERNAME must be a valid 5-32 character Telegram username",
    );
  }
  return username;
}

export function parseAppConfig(
  environment: NonSecretEnvironment,
): AppConfig {
  const appName =
    environment.APP_NAME?.trim() || DEFAULT_APP_NAME;
  if (/[\u0000-\u001f\u007f]/.test(appName) || appName.length > 64) {
    throw new Error("APP_NAME must be at most 64 characters without control characters");
  }

  return {
    telegramBotUsername: normalizeBotUsername(
      environment.TELEGRAM_BOT_USERNAME,
    ),
    telegramAllowedUserId: normalizeAllowedUserId(
      environment.TELEGRAM_ALLOWED_USER_ID,
    ),
    openaiCompatibleBaseUrl: normalizeBaseUrl(
      environment.OPENAI_COMPATIBLE_BASE_URL,
    ),
    openaiCompatibleModel: requiredText(
      environment.OPENAI_COMPATIBLE_MODEL,
      "OPENAI_COMPATIBLE_MODEL",
    ),
    appName,
  };
}
