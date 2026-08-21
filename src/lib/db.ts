import { PrismaClient } from '@prisma/client'

// ── Fallback DATABASE_URL for when Netlify env var is missing or points to SQLite ──
const FALLBACK_DATABASE_URL = 'postgresql://postgres.rrvmogahtzenueinepgk:messilibelkis2601214@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'

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
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db