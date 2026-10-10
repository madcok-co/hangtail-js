import { SessionStore } from './store'
import { installFetchInterceptor } from './interceptors/fetch'
import { installXhrInterceptor } from './interceptors/xhr'

export type { SessionOptions } from './types'
export type { Session } from './session'

const store = new SessionStore()
const uninstallFetch = installFetchInterceptor(store)
const uninstallXhr = installXhrInterceptor(store)

const hangtail = {
  /**
   * Start tracking a new flow session. All fetch/XHR requests will
   * automatically carry the correlation header until the session ends.
   *
   * @example — telco call arrives via WebSocket
   * socket.on('incoming_call', ({ call_id }) => {
   *   hangtail.start(call_id, { correlationHeader: 'X-Call-ID', ttl: 3_600_000 })
   * })
   */
  start: store.start.bind(store),

  /**
   * End a session. Returns headers to include in the final outgoing request
   * so the backend receives the flow-end signal. The session is removed
   * immediately — subsequent requests will NOT carry the correlation header.
   *
   * @example — agent changes status after call ends
   * socket.on('call_ended', ({ call_id }) => {
   *   const endHeaders = hangtail.end(call_id)
   *   await api.post('/status/available', { headers: endHeaders })
   * })
   */
  end: store.end.bind(store),

  /** Get the currently active session (most recently started). */
  active: store.active.bind(store),

  /** Get a session by id. */
  session: store.get.bind(store),

  /**
   * Remove all interceptors. Call on app teardown (e.g. SPA unmount).
   */
  uninstall(): void {
    uninstallFetch()
    uninstallXhr()
  },

  /** @internal — for testing only */
  _store: store,
}

export default hangtail
export { hangtail }
