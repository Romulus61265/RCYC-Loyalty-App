import { Platform } from 'react-native';
import { logger } from '@/core/logging';
import { toAppError, type AppError } from './AppError';

const log = logger.child('errors');

/** Single funnel for reporting an error. Future: forward to crash reporting. */
export function reportError(e: unknown, context?: Record<string, string | number | boolean>): AppError {
  const err = toAppError(e);
  const record = { code: err.code, retryable: err.retryable, ...err.context, ...context };
  if (err.severity === 'info' || err.severity === 'warning') log.warn(err.message, record);
  else log.error(err.message, err, record);
  return err;
}

interface RNErrorUtils {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

let installed = false;

/**
 * Captures errors that escape React (async callbacks, timers, promise
 * rejections). Render errors are handled by route ErrorBoundaries instead.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  const errorUtils = (globalThis as { ErrorUtils?: RNErrorUtils }).ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      reportError(error, { fatal: Boolean(isFatal), source: 'global' });
      previous(error, isFatal); // keep RN's red box in dev / crash behaviour in prod
    });
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      reportError(event.reason, { source: 'unhandledrejection' });
    });
  }
}
