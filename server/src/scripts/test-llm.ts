import "dotenv/config"
import { callLlm } from "../lib/llm-client.js"

async function main() {
  const result = await callLlm("Say hello in one short sentence.")

  console.log(result)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})