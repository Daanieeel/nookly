/// Structured logs: one JSON object per line. Never log a request body, a header, a
/// token or a password; `redact` scrubs fields by name in case one slips in.

type Level = "debug" | "info" | "warn" | "error";
type LogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | LogValue[]
  | { [key: string]: LogValue };
export type LogFields = { [key: string]: LogValue };

const ORDER = { debug: 10, info: 20, warn: 30, error: 40 } satisfies Record<Level, number>;
const SECRET = /pass|token|secret|authorization|cookie|hash/i;

export function redact(fields: LogFields) {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET.test(key)) out[key] = "[redacted]";
    else if (value && !Array.isArray(value) && value instanceof Object) out[key] = redact(value);
    else out[key] = value;
  }
  return out;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

export function createLogger(
  level: Level,
  write: (line: string) => void = (l) => process.stdout.write(`${l}\n`),
): Logger {
  const at =
    (lvl: Level) =>
    (msg: string, fields: LogFields = {}) => {
      if (ORDER[lvl] < ORDER[level]) return;
      write(JSON.stringify({ time: new Date().toISOString(), level: lvl, msg, ...redact(fields) }));
    };
  return { debug: at("debug"), info: at("info"), warn: at("warn"), error: at("error") };
}
