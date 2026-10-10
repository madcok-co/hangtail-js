import { describe, it, expect, vi, beforeEach } from 'vitest'
import hangtail from './index'
import { _setFetchDelegate } from './interceptors/fetch'

// ── helpers ────────────────────────────────────────────────────────────────

type CapturedRequest = { url: string; headers: Record<string, string> }

function mockFetch(): { captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = []
  // Replace the delegate INSIDE the interceptor, not globalThis.fetch itself —
  // otherwise vi.stubGlobal would overwrite the wrapper and bypass injection.
  _setFetchDelegate(vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v })
    captured.push({ url, headers })
    return Promise.resolve(new Response('ok'))
  }) as typeof fetch)
  return { captured }
}

beforeEach(() => {
  hangtail._store.clear()
})

// ── tests ──────────────────────────────────────────────────────────────────

describe('fetch interception', () => {
  it('injects correlation header into all requests while session is active', async () => {
    const { captured } = mockFetch()
    hangtail.start('call-001')

    await fetch('/api/answer', { method: 'POST' })
    await fetch('/api/status/incall', { method: 'POST' })

    expect(captured[0].headers['x-correlation-id']).toBe('call-001')
    expect(captured[1].headers['x-correlation-id']).toBe('call-001')
  })

  it('does not inject after session ends', async () => {
    const { captured } = mockFetch()
    hangtail.start('call-001')
    hangtail.end('call-001')

    await fetch('/api/status/available', { method: 'POST' })

    expect(captured[0].headers['x-correlation-id']).toBeUndefined()
  })

  it('does not override an existing correlation header set by the caller', async () => {
    const { captured } = mockFetch()
    hangtail.start('call-001')

    await fetch('/api/answer', {
      method: 'POST',
      headers: { 'X-Correlation-ID': 'caller-set' },
    })

    expect(captured[0].headers['x-correlation-id']).toBe('caller-set')
  })
})

describe('session.end()', () => {
  it('returns both correlation and flow-end headers', () => {
    hangtail.start('call-001')
    const headers = hangtail.end('call-001')

    expect(headers).toEqual({
      'X-Correlation-ID': 'call-001',
      'X-Flow-End': 'true',
    })
  })

  it('returns null for an unknown session id', () => {
    expect(hangtail.end('nonexistent')).toBeNull()
  })
})

describe('urlFilter', () => {
  it('only injects into matching URLs', async () => {
    const { captured } = mockFetch()
    hangtail.start('call-001', { urlFilter: '/api/call/' })

    await fetch('/api/status')        // no match
    await fetch('/api/call/answer')   // match

    expect(captured[0].headers['x-correlation-id']).toBeUndefined()
    expect(captured[1].headers['x-correlation-id']).toBe('call-001')
  })

  it('accepts RegExp filter', async () => {
    const { captured } = mockFetch()
    hangtail.start('call-001', { urlFilter: /\/call\// })

    await fetch('/api/call/answer')
    await fetch('/api/status')

    expect(captured[0].headers['x-correlation-id']).toBe('call-001')
    expect(captured[1].headers['x-correlation-id']).toBeUndefined()
  })
})

describe('custom headers', () => {
  it('respects custom correlationHeader and flowEndHeader', () => {
    hangtail.start('call-001', {
      correlationHeader: 'X-Call-ID',
      flowEndHeader: 'X-Call-Ended',
    })
    const headers = hangtail.end('call-001')

    expect(headers['X-Call-ID']).toBe('call-001')
    expect(headers['X-Call-Ended']).toBe('true')
  })
})

describe('ttl', () => {
  it('auto-removes session after ttl expires', async () => {
    vi.useFakeTimers()
    const { captured } = mockFetch()

    hangtail.start('call-001', { ttl: 1_000 })
    vi.advanceTimersByTime(1_001)

    await fetch('/api/status')
    expect(captured[0]?.headers['x-correlation-id']).toBeUndefined()

    vi.useRealTimers()
  })
})

describe('multiple concurrent sessions', () => {
  it('active session is the most recently started', () => {
    hangtail.start('call-001')
    hangtail.start('call-002')

    expect(hangtail.active()?.id).toBe('call-002')
  })

  it('active falls back to remaining session when current ends', () => {
    hangtail.start('call-001')
    hangtail.start('call-002')
    hangtail.end('call-002')

    expect(hangtail.active()?.id).toBe('call-001')
  })
})
