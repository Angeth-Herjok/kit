// Wrapper around the logger API to load a namespaced logger with the right options
import actualCreateLogger, { LogLevel, printDuration } from '@openfn/logger';
import type { Opts } from '../options';

export type { Logger, LogOptions, LogLevel } from '@openfn/logger';
export { isValidLogLevel, defaultLogger } from '@openfn/logger';

// All known loggers
export const CLI = 'cli';
export const COMPILER = 'compiler';
export const RUNTIME = 'runtime';
export const JOB = 'job';

const namespaces: Record<string, string> = {
  [CLI]: 'CLI',
  [RUNTIME]: 'R/T',
  [COMPILER]: 'CMP',
  [JOB]: 'JOB',
};

export const createLogger = (
  name: string = '',
  options: Partial<Pick<Opts, 'log' | 'logJson'>>
) => {
  const logOptions = options.log || {};
  let json = false;
  let level: LogLevel = logOptions[name] || logOptions.default || 'default';
  if (options.logJson) {
    json = true;
  }
  return actualCreateLogger(namespaces[name] || name, {
    level,
    json,
    ...logOptions,
  });
};

export default createLogger;

export const createNullLogger = () =>
  createLogger(undefined, { log: { default: 'none' } });

export { printDuration };
