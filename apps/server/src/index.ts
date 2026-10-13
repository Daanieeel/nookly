import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { connect, migrateDatabase } from "./db/client.ts";
import { createLogger } from "./log.ts";
import { ConsoleMailer, SmtpMailer } from "./mail/mailer.ts";

const config = loadConfig();
const log = createLogger(config.LOG_LEVEL);
if (config.NODE_ENV === "production" && config.MAILER === "console") {
  log.warn("MAILER=console in production: email links are written to the log, which leaks them");
}
const { sql, db } = connect(config.DATABASE_URL);
await migrateDatabase(db);
const mailer =
  config.MAILER === "smtp" && config.SMTP_URL
    ? new SmtpMailer(config.SMTP_URL, config.MAIL_FROM)
    : new ConsoleMailer(log);
const { app } = buildApp({ config, db, mailer, log });
app.listen({ port: config.PORT, hostname: "0.0.0.0" });
log.info("listening", { port: config.PORT, version: config.version });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info("shutting down", { signal });
  // Stops taking new requests and lets the ones in flight finish.
  await app.stop();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
