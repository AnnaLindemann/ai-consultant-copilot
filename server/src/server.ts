import "dotenv/config"
import app from "./app.js"
import {prisma} from "./lib/prisma.js"
import { failureIdentity } from "./lib/failure-identity.js"

const PORT = Number(process.env.PORT) || 4000

async function startServer() {
  try{

    await prisma.$connect()
    console.log("Database is connected")
    app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

  } catch(error){
    // Identifiers only: a connection failure arrives carrying the connection
    // string it failed on, password included (`failure-identity.ts`).
    console.error("DATABASE_CONNECTION_FAILED", failureIdentity(error))
    process.exit(1)
  }
}

startServer()

