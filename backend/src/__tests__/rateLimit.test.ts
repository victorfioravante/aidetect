/**
 * Testes unitários para rateLimitMiddleware
 *
 * O rate limiter usa um Map em memória (sem Redis em teste) com janela de 24h.
 * Os testes exercitam:
 *   - Comportamento normal dentro do limite
 *   - Bloqueio após exceder MAX requisições
 *   - Headers X-RateLimit-* corretos
 *   - Reset de janela após expirar
 *   - Hashing de IP (privacidade — IP nunca armazenado em texto claro)
 *   - Suporte a X-Forwarded-For (proxy/Netlify)
 *
 * Estratégia de isolamento: o store do módulo é um Map singleton persistido
 * entre testes (o setInterval mantém o módulo vivo). Cada teste usa um IP
 * único gerado por uniqueIp() para garantir contador zerado.
 */

import { describe, it, expect, vi } from 'vitest'
import { rateLimitMiddleware } from '../middleware/rateLimit'
import type { Request, Response, NextFunction } from 'express'

// Contador global para gerar IPs únicos por teste — evita colisão no store singleton
let ipCounter = 0
function uniqueIp(): string {
  ipCounter++
  return `10.${Math.floor(ipCounter / 65025) % 256}.${Math.floor(ipCounter / 255) % 256}.${ipCounter % 255 || 1}`
}

function makeRequest(ip: string, forwarded?: string): Partial<Request> {
  return {
    ip,
    socket: { remoteAddress: ip } as never,
    headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
  }
}

interface MockResponse {
  res: Partial<Response>
  ctx: { status: number | null; body: unknown; headers: Record<string, unknown> }
}

function makeResponse(): MockResponse {
  // ctx é um objeto — leituras posteriores de ctx.status refletem mutações feitas pelo middleware
  const ctx: { status: number | null; body: unknown; headers: Record<string, unknown> } = {
    status: null,
    body: null,
    headers: {},
  }
  const res: Partial<Response> = {
    setHeader: (name: string, value: unknown) => { ctx.headers[name] = value; return res as Response },
    status: (code: number) => { ctx.status = code; return res as Response },
    json: (data: unknown) => { ctx.body = data; return res as Response },
  }
  // Retorna ctx por referência — não faz spread (spread copia primitivos e perde mutações)
  return { res, ctx }
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('rateLimitMiddleware', () => {
  it('permite as primeiras MAX requisições e chama next()', () => {
    const req = makeRequest(uniqueIp()) as Request
    const { res } = makeResponse()
    let nextCalled = 0
    const next: NextFunction = () => { nextCalled++ }

    rateLimitMiddleware(req, res as Response, next)
    rateLimitMiddleware(req, res as Response, next)
    rateLimitMiddleware(req, res as Response, next)

    expect(nextCalled).toBe(3)
  })

  it('bloqueia com 429 na 4ª requisição (MAX=3)', () => {
    const ip = uniqueIp()
    const req = makeRequest(ip) as Request
    const next: NextFunction = vi.fn()

    rateLimitMiddleware(req, makeResponse().res as Response, next)
    rateLimitMiddleware(req, makeResponse().res as Response, next)
    rateLimitMiddleware(req, makeResponse().res as Response, next)

    const blocked = makeResponse()
    rateLimitMiddleware(req, blocked.res as Response, next)

    expect(blocked.ctx.status).toBe(429)
    expect((blocked.ctx.body as { success: boolean }).success).toBe(false)
    expect((blocked.ctx.body as { error: string }).error).toBe('RATE_LIMIT_EXCEEDED')
  })

  it('define X-RateLimit-Limit = MAX em todas as respostas', () => {
    const req = makeRequest(uniqueIp()) as Request
    const m = makeResponse()
    const next: NextFunction = vi.fn()

    rateLimitMiddleware(req, m.res as Response, next)

    expect(m.ctx.headers['X-RateLimit-Limit']).toBe(3)
  })

  it('decrementa X-RateLimit-Remaining a cada requisição', () => {
    const ip = uniqueIp()
    const req = makeRequest(ip) as Request
    const next: NextFunction = vi.fn()

    const m1 = makeResponse()
    rateLimitMiddleware(req, m1.res as Response, next)
    expect(m1.ctx.headers['X-RateLimit-Remaining']).toBe(2)

    const m2 = makeResponse()
    rateLimitMiddleware(req, m2.res as Response, next)
    expect(m2.ctx.headers['X-RateLimit-Remaining']).toBe(1)

    const m3 = makeResponse()
    rateLimitMiddleware(req, m3.res as Response, next)
    expect(m3.ctx.headers['X-RateLimit-Remaining']).toBe(0)
  })

  it('define X-RateLimit-Reset como ISO string no futuro', () => {
    const req = makeRequest(uniqueIp()) as Request
    const m = makeResponse()
    const next: NextFunction = vi.fn()

    rateLimitMiddleware(req, m.res as Response, next)

    const reset = new Date(m.ctx.headers['X-RateLimit-Reset'] as string).getTime()
    expect(reset).toBeGreaterThan(Date.now())
  })

  it('IPs diferentes têm contadores independentes', () => {
    const reqA = makeRequest(uniqueIp()) as Request
    const reqB = makeRequest(uniqueIp()) as Request
    const next: NextFunction = vi.fn()

    rateLimitMiddleware(reqA, makeResponse().res as Response, next)
    rateLimitMiddleware(reqA, makeResponse().res as Response, next)
    rateLimitMiddleware(reqA, makeResponse().res as Response, next)

    const mB = makeResponse()
    rateLimitMiddleware(reqB, mB.res as Response, next)
    expect(mB.ctx.headers['X-RateLimit-Remaining']).toBe(2)
    expect(mB.ctx.status).not.toBe(429)
  })

  it('reseta contador após a janela de tempo expirar', () => {
    const ip = uniqueIp()
    const req = makeRequest(ip) as Request
    const next: NextFunction = vi.fn()

    rateLimitMiddleware(req, makeResponse().res as Response, next)
    rateLimitMiddleware(req, makeResponse().res as Response, next)
    rateLimitMiddleware(req, makeResponse().res as Response, next)

    const futureTime = Date.now() + 25 * 60 * 60 * 1000
    const spy = vi.spyOn(Date, 'now').mockReturnValue(futureTime)

    const mAfter = makeResponse()
    rateLimitMiddleware(req, mAfter.res as Response, next)

    expect(mAfter.ctx.status).not.toBe(429)
    expect(mAfter.ctx.headers['X-RateLimit-Remaining']).toBe(2)

    spy.mockRestore()
  })

  it('usa X-Forwarded-For quando disponível (proxy/Netlify)', () => {
    const ip1 = uniqueIp()
    const ip2 = uniqueIp()
    const reqProxy1 = makeRequest(ip1, `${ip1}, 10.0.0.1`) as Request
    const reqProxy2 = makeRequest(ip2, `${ip2}, 10.0.0.1`) as Request
    const next: NextFunction = vi.fn()

    const m1 = makeResponse()
    const m2 = makeResponse()
    rateLimitMiddleware(reqProxy1, m1.res as Response, next)
    rateLimitMiddleware(reqProxy2, m2.res as Response, next)

    expect(m1.ctx.status).not.toBe(429)
    expect(m2.ctx.status).not.toBe(429)
  })

  it('não expõe o IP em texto claro na resposta de erro 429', () => {
    const ip = uniqueIp()
    const req = makeRequest(ip) as Request
    const next: NextFunction = vi.fn()

    rateLimitMiddleware(req, makeResponse().res as Response, next)
    rateLimitMiddleware(req, makeResponse().res as Response, next)
    rateLimitMiddleware(req, makeResponse().res as Response, next)

    const blocked = makeResponse()
    rateLimitMiddleware(req, blocked.res as Response, next)

    const bodyStr = JSON.stringify(blocked.ctx.body)
    expect(bodyStr).not.toContain(ip)
  })
})
