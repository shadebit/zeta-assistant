import { createLogger, format, transports } from 'winston';
import type { Logger as WinstonInstance } from 'winston';
import { join } from 'node:path';
import type { Logger } from './logger.js';

const LEVEL_COLORS: Record<string, string> = {
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  debug: '\x1b[90m',
};

const RESET = '\x1b[0m';

const consoleFormat = format.printf(({ level, message, timestamp, context }) => {
  const color = LEVEL_COLORS[level] ?? '';
  const tag = level.toUpperCase().padEnd(5);
  const ctx = typeof context === 'string' ? context : 'App';
  return `${color}[${String(timestamp)}] [${tag}] [${ctx}]${RESET} ${String(message)}`;
});

const winstonInstance: WinstonInstance = createLogger({
  level: 'debug',
  transports: [
    new transports.Console({
      stderrLevels: ['info', 'warn', 'error', 'debug'],
      format: format.combine(format.timestamp(), consoleFormat),
    }),
  ],
});

// Winston throws if you add the same file transport twice, so we guard with a flag.
let fileTransportAdded = false;

export function initLoggerTransports(logsDir: string): void {
  if (fileTransportAdded) {
    return;
  }

  winstonInstance.add(
    new transports.File({
      filename: join(logsDir, 'zeta.log'),
      format: format.combine(format.timestamp(), format.json()),
    }),
  );

  fileTransportAdded = true;
}

/** @internal */
export function _resetFileTransport(): void {
  fileTransportAdded = false;
}

export function formatLogEntry(entry: {
  level: string;
  message: string;
  timestamp?: string;
  context?: string;
}): string {
  const color = LEVEL_COLORS[entry.level] ?? '';
  const tag = entry.level.toUpperCase().padEnd(5);
  const ctx = typeof entry.context === 'string' ? entry.context : 'App';
  return `${color}[${String(entry.timestamp ?? new Date().toISOString())}] [${tag}] [${ctx}]${RESET} ${String(entry.message)}`;
}

export class WinstonLogger implements Logger {
  private readonly context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string): void {
    winstonInstance.info(message, { context: this.context });
  }

  warn(message: string): void {
    winstonInstance.warn(message, { context: this.context });
  }

  error(message: string): void {
    winstonInstance.error(message, { context: this.context });
  }

  debug(message: string): void {
    winstonInstance.debug(message, { context: this.context });
  }
}
