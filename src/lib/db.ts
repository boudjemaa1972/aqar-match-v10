import { PrismaClient } from '@prisma/client'

// ── Fallback DATABASE_URL for when Netlify env var is missing or points to SQLite ──
// Uses transaction-mode pooler (port 6543) for serverless — avoids 'max clients reached'
const FALLBACK_DATABASE_URL = 'postgresql://postgres.rrvmogahtzenueinepgk:messilibelkis2601214@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true'

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:')) {
  console.warn('[db.ts] DATABASE_URL is missing or points to SQLite — using Supabase fallback')
  process.env.DATABASE_URL = FALLBACK_DATABASE_URL
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
    // Limit connections per function invocation to prevent pool exhaustion
    datasources: {
      db: {
        url: process.env.DATABASE_URL + (process.env.DATABASE_URL?.includes('?') ? '&' : '?') + 'connection_limit=3&pool_timeout=10',
      },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db