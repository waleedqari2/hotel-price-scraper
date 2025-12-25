/**
 * Logging utility for structured and consistent logging
 * Provides different log levels (error, warn, info, debug)
 */

import config from '../config';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
}

const logLevels: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const getCurrentLogLevel = (): number => {
  const level = (config.logLevel as LogLevel) || 'info';
  return logLevels[level] || logLevels.info;
};

const formatLogEntry = (entry: LogEntry): string => {
  const contextStr = entry.context ? ` | ${JSON.stringify(entry.context)}` : '';
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${contextStr}`;
};

const log = (level: LogLevel, message: string, context?: Record<string, any>): void => {
  if (logLevels[level] > getCurrentLogLevel()) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };

  const formattedMessage = formatLogEntry(entry);

  switch (level) {
    case 'error':
      console.error(formattedMessage);
      break;
    case 'warn':
      console.warn(formattedMessage);
      break;
    case 'info':
      console.info(formattedMessage);
      break;
    case 'debug':
      console.debug(formattedMessage);
      break;
    default:
      console.log(formattedMessage);
  }
};

export const logger = {
  error: (message: string, context?: Record<string, any>) => log('error', message, context),
  warn: (message: string, context?: Record<string, any>) => log('warn', message, context),
  info: (message: string, context?: Record<string, any>) => log('info', message, context),
  debug: (message: string, context?: Record<string, any>) => log('debug', message, context),
};

export default logger;
