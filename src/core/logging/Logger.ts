/**
 * Logging abstraction.
 *
 * Code logs through `Logger`; where records go is decided by `LogSink`s
 * configured once at startup (console in development, an in-memory ring
 * buffer for diagnostics, and later a remote sink that batches to the BFF
 * telemetry endpoint / observability platform).
 *
 * Every record's context is PII-scrubbed before it reaches any sink.
 */
import { scrub } from '@/security/pii';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogContext = Record<string, unknown>;

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  context?: LogContext;
  error?: { name: string; message: string; code?: string; stack?: string };
}

export interface LogSink {
  write(record: LogRecord): void;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: unknown, context?: LogContext): void;
  /** Returns a logger tagged with a sub-scope, e.g. `services.voyage`. */
  child(scope: string): Logger;
}

export interface LoggerOptions {
  minLevel: LogLevel;
  sinks: LogSink[];
  includeStack: boolean;
  scope?: string;
}

export function createLogger(options: LoggerOptions): Logger {
  const scope = options.scope ?? 'app';

  const emit = (level: LogLevel, message: string, context?: LogContext, error?: unknown) => {
    if (ORDER[level] < ORDER[options.minLevel]) return;
    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      scope,
      message,
      context: context ? scrub(context) : undefined,
      error: error === undefined ? undefined : serializeError(error, options.includeStack),
    };
    for (const sink of options.sinks) {
      try {
        sink.write(record);
      } catch {
        // A failing sink must never break the app.
      }
    }
  };

  return {
    debug: (m, c) => emit('debug', m, c),
    info: (m, c) => emit('info', m, c),
    warn: (m, c) => emit('warn', m, c),
    error: (m, e, c) => emit('error', m, c, e),
    child: (sub) => createLogger({ ...options, scope: `${scope}.${sub}` }),
  };
}

function serializeError(e: unknown, includeStack: boolean): LogRecord['error'] {
  if (e instanceof Error) {
    const code = (e as { code?: unknown }).code;
    return {
      name: e.name,
      message: e.message,
      code: typeof code === 'string' ? code : undefined,
      stack: includeStack ? e.stack : undefined,
    };
  }
  return { name: 'NonError', message: String(e) };
}
