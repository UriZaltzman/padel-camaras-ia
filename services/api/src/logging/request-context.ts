import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Fields every log line carries while a request is being handled.
 * Only opaque ids: never names, phones, emails or tokens.
 */
export interface LogContext {
  request_id: string;
  club_id?: string;
  match_id?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentLogContext(): LogContext | undefined {
  return storage.getStore();
}

/** Adds the club or match of the current request once a guard or service knows it. */
export function setLogContext(fields: Pick<LogContext, 'club_id' | 'match_id'>): void {
  const context = storage.getStore();
  if (context) {
    Object.assign(context, fields);
  }
}
