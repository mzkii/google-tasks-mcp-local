// stdout は MCP プロトコル専用。ログは必ず stderr に出す。
// トークン等の秘匿情報はログに渡さないこと（念のためリダクションも行う）。
type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) in LOG_LEVELS
    ? (process.env.LOG_LEVEL as LogLevel)
    : "info";

const REDACTION_PATTERNS = [
  /(access[_-]?token["\s:=]+)[\w\-.]+/gi,
  /(refresh[_-]?token["\s:=]+)[\w\-.]+/gi,
  /(client[_-]?secret["\s:=]+)[\w\-.]+/gi,
  /(authorization:\s*bearer\s+)[\w\-.]+/gi,
  /(code["\s:=]+)[\w\-/]+/gi,
];

function redact(message: string): string {
  return REDACTION_PATTERNS.reduce(
    (m, pattern) => m.replace(pattern, "$1[REDACTED]"),
    message
  );
}

export function createLogger(defaultContext: { component?: string } = {}) {
  const log = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
    if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;
    const { component } = defaultContext;
    const extra = context
      ? Object.entries(context)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(" ")
      : "";
    const line = `${new Date().toISOString()} ${level.toUpperCase()} ${
      component ? `[${component}] ` : ""
    }${message} ${extra}`.trim();
    console.error(redact(line));
  };

  return {
    debug: (message: string, context?: Record<string, unknown>) => log("debug", message, context),
    info: (message: string, context?: Record<string, unknown>) => log("info", message, context),
    warn: (message: string, context?: Record<string, unknown>) => log("warn", message, context),
    error: (message: string, context?: Record<string, unknown>) => log("error", message, context),
  };
}
