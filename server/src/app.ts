import express from "express"
import cors from "cors"
import casesRouter from "./routes/cases.js"

const app = express()
app.use(cors())
app.use(express.json())

app.get("/health", (req, res) => {
  res.json({status: true, message: "it is working" })
})

app.use("/cases", casesRouter)

export default app