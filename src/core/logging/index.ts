import { env } from '@/config/env';
import { createLogger, type LogSink } from './Logger';
import { ConsoleSink, MemorySink } from './sinks';

export * from './Logger';
export { ConsoleSink, MemorySink, RemoteSink } from './sinks';

/** In-memory history of recent records (diagnostics / tests). */
export const memorySink = new MemorySink();

const sinks: LogSink[] = [memorySink];
if (env.appEnv !== 'production') sinks.push(new ConsoleSink());

/** Root application logger. Prefer `logger.child('feature')` in modules. */
export const logger = createLogger({
  minLevel: env.logLevel,
  sinks,
  includeStack: env.appEnv !== 'production',
});
