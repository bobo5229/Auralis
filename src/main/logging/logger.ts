import pino from 'pino'

const isDevelopment = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: isDevelopment ? 'debug' : 'info',
})
