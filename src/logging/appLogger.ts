/**
 * Application logger — the middleware's "professional diary".
 *
 * Creates a Winston logger with three outputs:
 * 1. Console — colored, human-readable (for development)
 * 2. Combined file — JSON, daily rotation (all levels)
 * 3. Error file — JSON, daily rotation (errors only)
 *
 * Every log entry includes a timestamp, level, and optional structured metadata
 * (e.g., { analyzerId: 'sysmex-xn550', barcode: '12345678' }).
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { resolve } from 'node:path';

/** Configuration for the application logger. */
export interface LoggerConfig {
  /** Minimum severity to log: 'debug' | 'info' | 'warn' | 'error' */
  level: string;
  /** Directory for log files (e.g., './logs') */
  dir: string;
  /** How many days of log files to keep before deleting old ones */
  maxFiles: number;
  /** Maximum size per log file in megabytes */
  maxSizeMb: number;
}

/**
 * Creates a configured Winston logger.
 *
 * @param config - Logger settings (level, directory, retention, size)
 * @returns A Winston Logger instance ready to use
 */
export function createAppLogger(config: LoggerConfig): winston.Logger {
  const logDir = resolve(config.dir);

  // JSON format with timestamp for file transports
  const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  );

  // Colored, readable format for console
  const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] [${level}] ${message}${metaStr}`;
    }),
  );

  return winston.createLogger({
    level: config.level,
    defaultMeta: { service: 'lab-middleware' },
    transports: [
      // Console — always on, colored for development readability
      new winston.transports.Console({ format: consoleFormat }),

      // Combined log — all levels, daily rotation
      new DailyRotateFile({
        dirname: logDir,
        filename: 'combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: `${config.maxSizeMb}m`,
        maxFiles: `${config.maxFiles}d`,
        format: fileFormat,
      }),

      // Error-only log — errors get their own file for quick scanning
      new DailyRotateFile({
        dirname: logDir,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxSize: `${config.maxSizeMb}m`,
        maxFiles: `${config.maxFiles}d`,
        format: fileFormat,
      }),
    ],
  });
}
