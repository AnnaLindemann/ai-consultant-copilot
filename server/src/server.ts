import "dotenv/config"
import app from "./app.js"
import { failureIdentity } from "./lib/failure-identity.js"
import { logger } from "./lib/application-logger.js"
import { installProcessErrorHandlers } from "./lib/process-error-handlers.js"
import { prisma } from "./lib/prisma.js"

const PORT = Number(process.env.PORT) || 4000

installProcessErrorHandlers()

async function startServer() {
  try {

    await prisma.$connect()
    logger.info("database.connected")
    app.listen(PORT, () => {
      logger.info("server.started", { port: PORT })
    })

  } catch (error) {
    // Identifiers only: a connection failure arrives carrying the connection
    // string it failed on, password included (`failure-identity.ts`).
    logger.error("DATABASE_CONNECTION_FAILED", failureIdentity(error))
    process.exit(1)
  }
}

startServer()
