import { Session } from './session'
import type { SessionOptions, ResolvedOptions } from './types'

const DEFAULTS: ResolvedOptions = {
  correlationHeader: 'X-Correlation-ID',
  flowEndHeader: 'X-Flow-End',
  urlFilter: null,
  ttl: 0,
}

export class SessionStore {
  private _sessions = new Map<string, Session>()
  private _activeId: string | null = null

  start(id: string, options?: SessionOptions): Session {
    // Remove any existing session with same id before creating a new one.
    this._sessions.get(id)?.end()

    const resolved: ResolvedOptions = {
      ...DEFAULTS,
      ...options,
      urlFilter: options?.urlFilter
        ? Array.isArray(options.urlFilter)
          ? options.urlFilter
          : [options.urlFilter]
        : null,
    }

    const session = new Session(id, resolved, () => this._remove(id))
    this._sessions.set(id, session)
    this._activeId = id
    return session
  }

  get(id: string): Session | undefined {
    return this._sessions.get(id)
  }

  active(): Session | undefined {
    return this._activeId ? this._sessions.get(this._activeId) : undefined
  }

  end(id: string): Record<string, string> | null {
    const session = this._sessions.get(id)
    if (!session) return null
    return session.end() // session.end() calls _onRemove → _remove(id)
  }

  /**
   * For use by interceptors: find the best session for an outgoing URL.
   * Prefers the active session; falls back to any matching session.
   */
  forUrl(url: string): Session | undefined {
    const active = this.active()
    if (active && !active.ended && active.matchesUrl(url)) return active

    for (const session of this._sessions.values()) {
      if (!session.ended && session.matchesUrl(url)) return session
    }
    return undefined
  }

  /** Exposed for testing. */
  clear(): void {
    this._sessions.clear()
    this._activeId = null
  }

  private _remove(id: string): void {
    this._sessions.delete(id)
    if (this._activeId === id) {
      const keys = [...this._sessions.keys()]
      this._activeId = keys.length > 0 ? keys[keys.length - 1] : null
    }
  }
}
