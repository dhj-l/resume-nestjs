import { join } from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

/* ------------------------------------------------------------------ */
/*  日志目录（项目根 /logs）                                          */
/* ------------------------------------------------------------------ */

const LOG_DIR = join(process.cwd(), 'logs');

/* ------------------------------------------------------------------ */
/*  通用格式                                                          */
/* ------------------------------------------------------------------ */

const printf = winston.format.printf(
  ({ timestamp, level, context, message, ...meta }) => {
    const ctx = context ? `[${context}] ` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level.toUpperCase()} ${ctx}${message}${metaStr}`;
  },
);

/* ------------------------------------------------------------------ */
/*  传输层                                                            */
/* ------------------------------------------------------------------ */

/** 所有级别日志 — 按天轮转，保留 14 天 */
const allFileTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    printf,
  ),
});

/** 错误日志 — 单独文件，保留 30 天 */
const errorFileTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '30d',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    printf,
  ),
});

/** HTTP 请求日志 — 单独文件，保留 7 天（仅写入 context === 'HTTP'） */
const httpOnly = winston.format((info) => {
  return info.context === 'HTTP' ? info : false;
});

const httpFileTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'http-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '7d',
  format: winston.format.combine(
    httpOnly(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    printf,
  ),
});

/** 控制台输出（开发环境保留彩色） */
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    printf,
  ),
});

/* ------------------------------------------------------------------ */
/*  Winston 实例                                                      */
/* ------------------------------------------------------------------ */

export const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  transports: [
    consoleTransport,
    allFileTransport,
    errorFileTransport,
    httpFileTransport,
  ],
});
