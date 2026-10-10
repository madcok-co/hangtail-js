export interface SessionOptions {
  /**
   * HTTP header name injected into outgoing requests.
   * Default: 'X-Correlation-ID'
   */
  correlationHeader?: string

  /**
   * HTTP header name used to signal flow completion on the final request.
   * Default: 'X-Flow-End'
   */
  flowEndHeader?: string

  /**
   * Restrict auto-injection to URLs matching these patterns.
   * Default: inject into all requests.
   */
  urlFilter?: string | RegExp | Array<string | RegExp>

  /**
   * Auto-expire the session after N milliseconds.
   * Useful as a safety net for calls that never receive a hangup event.
   * Default: 0 (no expiry).
   */
  ttl?: number
}

export interface ResolvedOptions {
  correlationHeader: string
  flowEndHeader: string
  urlFilter: Array<string | RegExp> | null
  ttl: number
}
