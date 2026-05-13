// Structured logger for the wheelup-vercel API. JSON Lines, one per call.

type Level = "info" | "warn" | "error";

interface LogFields {
  [key: string]: unknown;
}

function emit(level: Level, message: string, fields: LogFields): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...fields,
  };
  const stream = level === "error" ? console.error : console.log;
  try {
    stream(JSON.stringify(line));
  } catch {
    stream(`${level}: ${message}`);
  }
}

export const log = {
  info: (msg: string, fields: LogFields = {}) => emit("info", msg, fields),
  warn: (msg: string, fields: LogFields = {}) => emit("warn", msg, fields),
  error: (msg: string, fields: LogFields = {}) => emit("error", msg, fields),
};

let counter = 0;
export function newRequestId(): string {
  counter = (counter + 1) >>> 0;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function publicError(err: unknown, fallback = "internal_error"): string {
  if (err instanceof Error && err.message) {
    const firstLine = err.message.split("\n")[0]!.trim();
    return firstLine.slice(0, 160) || fallback;
  }
  return fallback;
}
