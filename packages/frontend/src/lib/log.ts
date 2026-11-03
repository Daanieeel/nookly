/* oxlint-disable anti-slop/no-unknown-parameters -- anything can be thrown or reject a promise, and this file is where such a value is parsed (`describeError`) */
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

/// One logger for the whole interface. Every line goes to the browser console and to the
/// log file kept by the backend (`src-tauri/src/logging.rs`), so a problem someone reports
/// leaves something to look at. Log what happened and where, never what people wrote:
/// titles, note text and file names stay out.

export type LogLevel = "error" | "warn" | "info" | "debug";

/// The backend's `AppError` (`{ kind, message }`), or anything else with a message.
const unknownText = z.union([
  z.object({ kind: z.string(), message: z.string() }).transform((e) => `${e.kind}: ${e.message}`),
  z.object({ message: z.string() }).transform((e) => e.message),
  z.string(),
]);

/// What a rejected command or a thrown value says, as one short line.
export function describeError(error: unknown): string {
  const parsed = unknownText.safeParse(error);
  return parsed.success ? parsed.data : String(error);
}

/// Writes one line. Never throws and never waits: the backend call is fire and forget,
/// and a logger that cannot reach the backend (a test, a closing window) stays quiet.
export function log(level: LogLevel, scope: string, message: string, error?: unknown) {
  const text = error === undefined ? message : `${message}: ${describeError(error)}`;
  // Read at call time, so a spy or a patched console is honored.
  if (level !== "debug") {
    if (error === undefined) console[level](message);
    else console[level](message, error);
  }
  invoke("log_frontend", { level, scope, message: text }).catch(() => {
    // The log is how failures get reported, so there is nowhere left to report this one.
  });
}

export const logger = {
  error: (scope: string, message: string, error?: unknown) => log("error", scope, message, error),
  warn: (scope: string, message: string, error?: unknown) => log("warn", scope, message, error),
  info: (scope: string, message: string) => log("info", scope, message),
  debug: (scope: string, message: string, error?: unknown) => log("debug", scope, message, error),
};

/// For a promise whose failure is fine to ignore: `.catch(ignoreError("saving the zoom"))`.
/// The user sees nothing, but the log keeps a debug line, so every swallowed error is
/// deliberate and can be searched for. `fallback` is what the promise resolves to instead.
export function ignoreError<T = undefined>(reason: string, fallback?: T): (error: unknown) => T {
  return (error) => {
    logger.debug("ignored", reason, error);
    // SAFETY: with no fallback `T` is `undefined`, which is what `fallback` is then.
    return fallback as T;
  };
}

/// Logs what nothing else caught: a script error, or a promise that rejected with no
/// handler. Returns a function that removes the listeners.
export function installGlobalErrorLogging(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    const where = event.filename ? ` (${event.filename}:${event.lineno})` : "";
    logger.error("window", `Uncaught error${where}`, event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    logger.error("window", "Unhandled promise rejection", event.reason);
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
