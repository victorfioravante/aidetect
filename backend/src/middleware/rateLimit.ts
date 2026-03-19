import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'

interface RateEntry {
  count: number
  resetAt: number
}

// In-memory store (swap for Redis by checking REDIS_URL)
const store = new Map<string, RateEntry>()

const MAX = Number(process.env.RATE_LIMIT_MAX || 3)
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW || 86400) * 1000

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'aidetect')).digest('hex').slice(0, 16)
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]
    return ip.trim()
  }
  return req.ip || req.socket.remoteAddress || 'unknown'
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req)
  const key = hashIp(ip)
  const now = Date.now()

  let entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS }
    store.set(key, entry)
  }

  entry.count++

  const remaining = Math.max(0, MAX - entry.count)
  res.setHeader('X-RateLimit-Limit', MAX)
  res.setHeader('X-RateLimit-Remaining', remaining)
  res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString())

  if (entry.count > MAX) {
    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      resetAt: new Date(entry.resetAt).toISOString(),
    })
    return
  }

  next()
}

// Cleanup old entries every hour
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key)
  }
}, 3600_000)
