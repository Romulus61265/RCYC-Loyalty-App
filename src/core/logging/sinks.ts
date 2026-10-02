/* eslint-disable no-console -- the console sink is the one sanctioned console writer. */
import type { LogRecord, LogSink } from './Logger';

/** Development sink: readable, level-appropriate console output. */
export class ConsoleSink implements LogSink {
  write(r: LogRecord) {
    const line = `[${r.level}] ${r.scope}: ${r.message}`;
    const extras = [r.context, r.error].filter(Boolean);
    if (r.level === 'error') console.error(line, ...extras);
    else if (r.level === 'warn') console.warn(line, ...extras);
    else if (r.level === 'info') console.info(line, ...extras);
    else console.debug(line, ...extras);
  }
}

/**
 * Keeps the most recent records in memory. Useful for a future in-app
 * diagnostics view ("send logs to guest services") and for tests.
 */
export class MemorySink implements LogSink {
  private records: LogRecord[] = [];
  constructor(private readonly capacity = 200) {}

  write(r: LogRecord) {
    this.records.push(r);
    if (this.records.length > this.capacity) this.records.shift();
  }

  snapshot(): readonly LogRecord[] {
    return [...this.records];
  }

  clear() {
    this.records = [];
  }
}

/**
 * Production sink (not yet wired): batches warn/error records to the BFF
 * telemetry endpoint, which forwards to the observability platform.
 */
export class RemoteSink implements LogSink {
  private queue: LogRecord[] = [];
  constructor(private readonly flush: (batch: LogRecord[]) => Promise<void>, private readonly batchSize = 20) {}

  write(r: LogRecord) {
    if (r.level !== 'warn' && r.level !== 'error') return;
    this.queue.push(r);
    if (this.queue.length >= this.batchSize) {
      const batch = this.queue.splice(0);
      void this.flush(batch).catch(() => this.queue.unshift(...batch.slice(-this.batchSize)));
    }
  }
}
