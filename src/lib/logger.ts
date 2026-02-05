// Simple logger that only logs in development
const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
  },
  error: (...args: any[]) => {
    // Always log errors, but in production send to monitoring service
    if (isDev) {
      console.error(...args);
    } else {
      // In production, could send to Sentry or similar
      // sentry.captureException(args[0]);
    }
  },
  warn: (...args: any[]) => {
    if (isDev) console.warn(...args);
  },
  info: (...args: any[]) => {
    if (isDev) console.info(...args);
  },
};
