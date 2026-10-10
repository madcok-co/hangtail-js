import type { SessionStore } from '../store'

// Module-level so tests can swap the underlying fetch without reinstalling the interceptor.
let _delegate: typeof globalThis.fetch | null = null

export function installFetchInterceptor(store: SessionStore): () => void {
  if (typeof globalThis.fetch !== 'function') return () => {}

  _delegate = globalThis.fetch.bind(globalThis)

  globalThis.fetch = function hangtailFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url

    const session = store.forUrl(url)
    if (!session || !_delegate) return _delegate!(input, init)

    const headers = new Headers(init?.headers)
    for (const [k, v] of Object.entries(session.headers())) {
      if (!headers.has(k)) headers.set(k, v)
    }
    return _delegate(input, { ...init, headers })
  }

  return () => {
    if (_delegate) globalThis.fetch = _delegate
    _delegate = null
  }
}

/** For testing: replace the underlying fetch that the interceptor delegates to. */
export function _setFetchDelegate(fn: typeof globalThis.fetch): void {
  _delegate = fn
}
