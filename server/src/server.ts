import "dotenv/config"
import app from "./app.js"
import {prisma} from "./lib/prisma.js"

const PORT = Number(process.env.PORT) || 4000

async function startServer() {
  try{

    await prisma.$connect()
    console.log("Database is connected")
    app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

  } catch(error){
    console.error("Database connection failed",error)
    process.exit(1)
  }
}

startServer()

