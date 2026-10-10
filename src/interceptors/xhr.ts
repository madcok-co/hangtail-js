import type { SessionStore } from '../store'

// Symbols so we don't pollute the XHR instance namespace.
const URL_KEY = Symbol('hangtail.url')

export function installXhrInterceptor(store: SessionStore): () => void {
  if (typeof XMLHttpRequest === 'undefined') return () => {}

  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    ...rest: [boolean?, string?, string?]
  ) {
    ;(this as any)[URL_KEY] = url.toString()
    return originalOpen.apply(this, [method, url, ...rest] as Parameters<typeof originalOpen>)
  }

  XMLHttpRequest.prototype.send = function (
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const url: string = (this as any)[URL_KEY] ?? ''
    const session = store.forUrl(url)
    if (session) {
      for (const [k, v] of Object.entries(session.headers())) {
        try {
          this.setRequestHeader(k, v)
        } catch {
          // setRequestHeader throws if called after send — safe to ignore
        }
      }
    }
    return originalSend.call(this, body)
  }

  return () => {
    XMLHttpRequest.prototype.open = originalOpen
    XMLHttpRequest.prototype.send = originalSend
  }
}
