import { serve } from '@hono/node-server'
import { app } from './app.ts'
import { config } from './config.ts'
import { migrate } from './db.ts'

if (config.env !== 'local' && config.authSecret.startsWith('dev-only')) {
  throw new Error(`AUTH_SECRET ${config.env} ortamı için ayarlanmalı`)
}

await migrate()

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`diecutting api [${config.env}] listening on :${info.port}`)
})

const shutdown = () => {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 8000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
