export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET_TOKEN: string;
  OPENAI_COMPATIBLE_API_KEY: string;
  TELEGRAM_BOT_USERNAME: string;
  TELEGRAM_ALLOWED_USER_ID: string;
  OPENAI_COMPATIBLE_BASE_URL: string;
  OPENAI_COMPATIBLE_MODEL: string;
  APP_NAME?: string;
  HermesetAgent: DurableObjectNamespace;
}
