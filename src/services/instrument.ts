import { toAppError } from '@/core/errors/AppError';
import type { Logger } from '@/core/logging';
import type { Services } from './contracts';

const SLOW_MS = 1500;

/**
 * Wraps every service method so failures are normalised to AppError and
 * logged with the service/method name and duration, whichever
 * implementation (mock or enterprise) is behind it. Screens still receive
 * the rejection and decide how to present it.
 */
export function instrumentServices(services: Services, log: Logger): Services {
  const entries = Object.entries(services).map(([name, impl]) => [name, instrument(name, impl as object, log.child(name))]);
  return Object.fromEntries(entries) as Services;
}

function instrument<T extends object>(name: string, target: T, log: Logger): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== 'function' || typeof prop !== 'string') return value;
      return (...args: unknown[]) => {
        const started = Date.now();
        let result: unknown;
        try {
          result = value.apply(obj, args);
        } catch (e) {
          const err = toAppError(e);
          log.warn(`${prop} failed`, { code: err.code });
          throw err;
        }
        if (!isPromise(result)) return result;
        return result.then(
          (resolved) => {
            const ms = Date.now() - started;
            if (ms > SLOW_MS) log.warn(`${prop} slow`, { ms });
            else log.debug(prop, { ms });
            return resolved;
          },
          (e: unknown) => {
            const err = toAppError(e);
            log.warn(`${prop} failed`, { code: err.code, ms: Date.now() - started, service: name });
            throw err;
          },
        );
      };
    },
  });
}

function isPromise(v: unknown): v is Promise<unknown> {
  return typeof (v as { then?: unknown } | null)?.then === 'function';
}
