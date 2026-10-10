import type { ResolvedOptions } from './types'

export class Session {
  readonly id: string
  readonly options: ResolvedOptions
  private _ended = false
  private _timer: ReturnType<typeof setTimeout> | null = null
  private readonly _onRemove: () => void

  constructor(id: string, options: ResolvedOptions, onRemove: () => void) {
    this.id = id
    this.options = options
    this._onRemove = onRemove

    if (options.ttl > 0) {
      this._timer = setTimeout(() => {
        this._ended = true
        this._clearTimer()
        this._onRemove()
      }, options.ttl)
    }
  }

  get ended(): boolean {
    return this._ended
  }

  /** Headers to inject into a regular (non-final) outgoing request. */
  headers(): Record<string, string> {
    return { [this.options.correlationHeader]: this.id }
  }

  /**
   * Marks the session as done and returns headers for the final request
   * (correlation + flow-end). The session is removed from the store.
   *
   * Pass the returned headers to the last REST call in the flow so the
   * backend receives the flow.end signal.
   */
  end(): Record<string, string> {
    this._ended = true
    this._clearTimer()
    this._onRemove()
    return {
      [this.options.correlationHeader]: this.id,
      [this.options.flowEndHeader]: 'true',
    }
  }

  matchesUrl(url: string): boolean {
    if (!this.options.urlFilter) return true
    return this.options.urlFilter.some((f) =>
      typeof f === 'string' ? url.includes(f) : f.test(url),
    )
  }

  private _clearTimer(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer)
      this._timer = null
    }
  }
}
