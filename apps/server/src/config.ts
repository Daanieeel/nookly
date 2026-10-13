import { z } from "zod";

/// Everything the server is configured with, from the environment. See `.env.example`.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  /// Signs access tokens. At least 32 random bytes; generate with `openssl rand -base64 48`.
  JWT_SECRET: z.string().min(32),
  /// Where people reach the server, for links in emails (verify, reset, invite).
  PUBLIC_URL: z.url().default("http://localhost:3000"),
  /// Origins allowed to call the API from a browser context; the desktop app's are the defaults.
  CORS_ORIGINS: z
    .string()
    .default("tauri://localhost,http://tauri.localhost,http://localhost:1420"),
  /// Read the client address from `X-Forwarded-For`, set by the reverse proxy.
  TRUST_PROXY: z.stringbool().default(false),
  MAIL_FROM: z.string().default("Nookly <no-reply@localhost>"),
  /// `console` prints emails to the log (development), `smtp` sends them.
  MAILER: z.enum(["console", "smtp"]).default("console"),
  SMTP_URL: z.string().optional(),
  MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(8 * 1024 * 1024),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  /// Multiplies every rate limit; tests raise it.
  RATE_LIMIT_SCALE: z.coerce.number().positive().default(1),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof envSchema> & { corsOrigins: string[]; version: string };

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.parse(env);
  if (parsed.MAILER === "smtp" && !parsed.SMTP_URL) throw new Error("MAILER=smtp needs SMTP_URL");
  return {
    ...parsed,
    corsOrigins: parsed.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    version: process.env.npm_package_version ?? "0.1.0",
  };
}
