import pkg from "../package.json" with { type: "json" };
import { z } from "zod";

/// Everything the server is configured with, from the environment. See `.env.example`.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  /// Signs sessions (better-auth). At least 32 random bytes: `openssl rand -base64 48`.
  /// `JWT_SECRET`, its name before better-auth, still works.
  AUTH_SECRET: z.string().min(32),
  /// The closed beta's key. When set, sign up needs it (`betaKey` in the body); when empty,
  /// anyone may sign up. Compared in constant time and never logged or stored.
  BETA_KEY: z
    .string()
    .optional()
    .transform((key) => key?.trim() || undefined),
  /// Where people reach the server, for links in emails (verify, reset, invite).
  PUBLIC_URL: z.url().default("http://localhost:3000"),
  /// Origins allowed to call the API from a browser context; the desktop app's are the defaults.
  CORS_ORIGINS: z
    .string()
    .default("tauri://localhost,http://tauri.localhost,http://localhost:1420"),
  /// Read the client address from `X-Forwarded-For`, set by the reverse proxy.
  TRUST_PROXY: z.stringbool().default(false),
  /// Accounts that sign in with a password must set up a second step before anything but
  /// setting it up works. Nookly's own server turns it on; a server of your own may too.
  REQUIRE_TWO_FACTOR: z.stringbool().default(false),
  /// How many proxies in front of the server append to `X-Forwarded-For` (Heroku's router,
  /// or Caddy: one). The address that many entries from the right is the client's; anything
  /// before it is the client's own claim.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(10).default(1),
  /// Serve the API reference at `/docs`. On while developing, off in production.
  API_DOCS: z.stringbool().optional(),
  MAIL_FROM: z.string().default("Nookly <no-reply@localhost>"),
  /// `console` prints emails to the log (development), `smtp` sends them.
  MAILER: z.enum(["console", "smtp"]).default("console"),
  SMTP_URL: z.string().optional(),
  MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(8 * 1024 * 1024),
  /// How long a device stays signed in without being used. Each use renews it.
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).default(60),
  /// OAuth providers: each one turns on when its id and secret are set.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_SECRET: z.string().optional(),
  NOTION_CLIENT_ID: z.string().optional(),
  NOTION_CLIENT_SECRET: z.string().optional(),
  /// Object storage for file contents. Any S3 API: MinIO locally, AWS S3 in production.
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("nookly"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /// Path style URLs (`endpoint/bucket/key`), which MinIO needs.
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),
  /// Make the bucket (with versioning) on start when it is missing. For development.
  S3_CREATE_BUCKET: z.stringbool().default(false),
  /// The largest file one upload may hold.
  MAX_BLOB_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(512 * 1024 * 1024),
  /// How long after the last edit a page document is saved and its rows written,
  /// and the longest it waits while edits keep coming.
  COLLAB_DEBOUNCE_MS: z.coerce.number().int().min(0).default(1500),
  COLLAB_MAX_DEBOUNCE_MS: z.coerce.number().int().min(0).default(10000),
  /// How often a device in use is noted as such for "last active" (at most once this long).
  SESSION_TOUCH_SECONDS: z.coerce.number().int().min(0).default(60),
  /// Multiplies every rate limit; tests raise it.
  RATE_LIMIT_SCALE: z.coerce.number().positive().default(1),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof envSchema> & {
  corsOrigins: string[];
  version: string;
  apiDocs: boolean;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.parse({ AUTH_SECRET: env.JWT_SECRET, ...env });
  if (parsed.MAILER === "smtp" && !parsed.SMTP_URL) throw new Error("MAILER=smtp needs SMTP_URL");
  return {
    ...parsed,
    corsOrigins: parsed.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    version: pkg.version,
    apiDocs: parsed.API_DOCS ?? parsed.NODE_ENV !== "production",
  };
}
