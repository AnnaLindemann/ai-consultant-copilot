import express from "express"
import cors from "cors"
import engagementsRouter from "./routes/engagements.js"
import organizationsRouter from "./routes/organizations.js"

const app = express()
app.use(cors())
app.use(express.json())

app.get("/health", (req, res) => {
  res.json({status: true, message: "it is working" })
})

app.use("/organizations", organizationsRouter)
app.use("/engagements", engagementsRouter)

export default app
