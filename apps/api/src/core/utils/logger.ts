import winston from 'winston';

import { env } from '../../config/env';
import { redactSensitive } from './redactSensitive';

const {
  combine,
  timestamp,
  json,
  printf,
  colorize,
} = winston.format;

const redactFormat = winston.format((info) => {
  const redacted = redactSensitive(info);

  if (
    typeof redacted === 'object'
    && redacted !== null
    && !Array.isArray(redacted)
  ) {
    Object.assign(info, redacted);
  }

  return info;
})();

const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ level, message, timestamp, stack, service, ...meta }) => {
    const metaString = Object.keys(meta).length > 0
      ? `\n${JSON.stringify(meta, null, 2)}`
      : '';

    return `${timestamp} ${level}: ${stack || message}${metaString}`;
  }),
);

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    redactFormat,
    timestamp(),
    json(),
  ),
  defaultMeta: {
    service: 'teamsynch-ai-api',
  },
  transports: [
    new winston.transports.Console({
      format: env.NODE_ENV === 'production'
        ? json()
        : consoleFormat,
    }),
  ],
});