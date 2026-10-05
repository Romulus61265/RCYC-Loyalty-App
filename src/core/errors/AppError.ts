/**
 * Error taxonomy.
 *
 * Every failure that reaches the UI is normalised to an `AppError` with a
 * stable `code`. Screens never show raw messages; they map the code to calm,
 * guest-appropriate copy (see `guestMessage`). Technical detail goes to the
 * logger only.
 */
export type ErrorCode =
  // Service / transport
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unavailable'
  | 'validation'
  | 'offline'
  | 'timeout'
  // Application
  | 'config'
  | 'render'
  | 'unknown';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

export interface AppErrorOptions {
  retryable?: boolean;
  severity?: ErrorSeverity;
  cause?: unknown;
  /** Non-PII diagnostic context — scrubbed again by the logger. */
  context?: Record<string, string | number | boolean>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly severity: ErrorSeverity;
  readonly context?: AppErrorOptions['context'];

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.retryable = options.retryable ?? defaultRetryable(code);
    this.severity = options.severity ?? (code === 'config' ? 'fatal' : 'error');
    this.context = options.context;
  }
}

function defaultRetryable(code: ErrorCode): boolean {
  return code === 'unavailable' || code === 'offline' || code === 'timeout' || code === 'unknown';
}

/** Normalises anything thrown into an AppError. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof Error) {
    if (e.name === 'AbortError') return new AppError('timeout', e.message, { cause: e });
    // fetch() rejects with TypeError("Network request failed") when offline — common at sea.
    if (e instanceof TypeError && /network|fetch/i.test(e.message)) return new AppError('offline', e.message, { cause: e });
    return new AppError('unknown', e.message, { cause: e });
  }
  return new AppError('unknown', typeof e === 'string' ? e : 'Unknown error', { cause: e });
}

export interface GuestMessage {
  title: string;
  body: string;
}

/** Calm, on-brand copy. Never an error code, never an exclamation mark. */
export function guestMessage(e: unknown): GuestMessage {
  switch (toAppError(e).code) {
    case 'offline':
      return { title: 'You appear to be offline', body: 'At sea, connection can come and go. We’ll try again the moment it returns.' };
    case 'unavailable':
    case 'timeout':
      return { title: 'We couldn’t reach the yacht just now', body: 'This is usually brief. Please try again in a moment.' };
    case 'unauthenticated':
      return { title: 'Please sign in again', body: 'For your security, your session has ended.' };
    case 'forbidden':
      return { title: 'This isn’t available to you', body: 'Your Suite Ambassador will gladly help.' };
    case 'not_found':
      return { title: 'We couldn’t find that', body: 'It may have changed. Your concierge can help.' };
    case 'conflict':
      return { title: 'Something changed in the meantime', body: 'Please review and try again.' };
    case 'validation':
      return { title: 'A detail needs your attention', body: 'Please check and try again.' };
    case 'config':
      return { title: 'The app isn’t quite ready', body: 'Please update to the latest version, or contact guest services.' };
    default:
      return { title: 'Something didn’t go to plan', body: 'Please try again. If it persists, your concierge is here to help.' };
  }
}
