import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

import type { Prisma } from "@prisma/client"

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL is not set")
}

const adapter = new PrismaPg({ connectionString })

export const prisma = new PrismaClient({ adapter })

// Which client a read runs on. Repository reads default to the shared pool, but
// a caller that has to decide something *and then write it* passes the
// transaction client instead, so the state it validated is the state it commits
// against rather than whatever was true one round trip earlier
// (coding-standards.md §6A).
export type DatabaseClient = Prisma.TransactionClient