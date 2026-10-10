# @hangtail/client

Client-side correlation context carrier for [hangtail](https://github.com/madcok-co/hangtail) — automatically injects flow headers into `fetch` and `XMLHttpRequest` requests so the backend can correlate logs across multiple services and protocols without OTel SDK instrumentation.

## Why

In flows that span multiple protocols (WebSocket push → REST API), logs from the same session end up with different IDs unless you explicitly propagate a shared correlation key. This library captures a session ID from any source (WebSocket event, user action, etc.) and automatically attaches it to every outgoing HTTP request for the duration of the session.

```
WebSocket push   → call_id: "call-abc123"  ← hangtail.start(call_id)
REST /answer     → X-Call-ID: call-abc123  ← auto-injected
REST /status     → X-Call-ID: call-abc123  ← auto-injected
REST /status     → X-Call-ID: call-abc123  ← auto-injected
                   X-Flow-End: true         ← hangtail.end(call_id)
```

The backend receives `X-Call-ID` on every request and includes it in logs. hangtail (collector-side) groups those logs by `correlation_key` and only forwards them if the flow never completes.

## Installation

```bash
npm install @hangtail/client
```

## Quick start

```typescript
import hangtail from '@hangtail/client'

// 1. Start a session when a flow begins
//    (e.g. inbound call arrives via WebSocket)
socket.on('incoming_call', ({ call_id }) => {
  hangtail.start(call_id, {
    correlationHeader: 'X-Call-ID',  // header injected into all requests
    ttl: 3_600_000,                  // auto-expire after 1 hour
  })
})

// 2. All fetch/XHR calls while the session is active automatically
//    carry the header — no changes needed to individual requests.
await api.post('/answer')
await api.post('/status/incall')

// 3. When the flow ends, call end() and pass the returned headers
//    to the final request so the backend receives the flow-end signal.
socket.on('call_ended', async ({ call_id }) => {
  const endHeaders = hangtail.end(call_id)
  await api.post('/status/available', { headers: endHeaders })
})
```

## API

### `hangtail.start(id, options?)`

Start tracking a new session. Returns a `Session` object.

```typescript
hangtail.start('call-abc123')
hangtail.start('order-456', {
  correlationHeader: 'X-Order-ID',
  flowEndHeader:     'X-Flow-End',
  urlFilter:         '/api/',      // only inject into /api/* requests
  ttl:               1_800_000,    // auto-expire after 30 min
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `correlationHeader` | string | `X-Correlation-ID` | Header injected into outgoing requests. |
| `flowEndHeader` | string | `X-Flow-End` | Header added on the final request via `end()`. |
| `urlFilter` | `string \| RegExp \| Array` | — | Restrict injection to matching URLs. Default: all requests. |
| `ttl` | number (ms) | `0` (off) | Auto-expire the session after N milliseconds. |

### `hangtail.end(id)`

End a session. Returns headers to include in the **final** outgoing request — this is how the backend knows the flow completed successfully.

```typescript
const endHeaders = hangtail.end('call-abc123')
// endHeaders = { 'X-Correlation-ID': 'call-abc123', 'X-Flow-End': 'true' }

await fetch('/api/status/available', {
  method: 'POST',
  headers: endHeaders,
})
```

Subsequent requests will **not** carry the correlation header after `end()` is called.

Returns `null` if the session id is not found.

### `hangtail.active()`

Get the currently active session (most recently started).

### `hangtail.session(id)`

Get a specific session by id.

### `hangtail.uninstall()`

Remove all fetch/XHR interceptors. Call on app teardown.

## Multiple concurrent sessions

Multiple sessions can be active simultaneously (e.g. an agent handling parallel calls). The most recently started session is the "active" one and is used for requests that match multiple sessions. When the active session ends, the next most recent session becomes active.

```typescript
hangtail.start('call-001', { correlationHeader: 'X-Call-ID' })
hangtail.start('call-002', { correlationHeader: 'X-Call-ID' })

// Requests use call-002 (active)
await api.post('/answer')

hangtail.end('call-002')

// Requests now use call-001 (promoted to active)
await api.post('/status/available')
```

## Backend setup

The backend reads the correlation header and includes it in logs. Combined with hangtail (the OTel Collector processor), only logs from flows that never received a `flow.end` signal are forwarded to the log backend.

**Collector config (`correlation_key`):**

```yaml
processors:
  hangtail:
    extension: hangtail
    correlation_key: call_id   # matches the header your backend logs
```

**Backend (Go example):**

```go
func handler(w http.ResponseWriter, r *http.Request) {
    callID := r.Header.Get("X-Call-ID")
    flowEnd := r.Header.Get("X-Flow-End")

    logger.Info("status changed",
        slog.String("call_id", callID),
        slog.String("flow.end", flowEnd),  // "true" on final request
    )
}
```

## Use cases

- **Telco / call center** — correlate logs across WebSocket signaling and REST status updates for an inbound call session
- **E-commerce** — track a customer journey from add-to-cart through checkout across multiple API calls
- **Multi-step forms** — correlate validation, submission, and confirmation requests

## License

Apache 2.0 — see [LICENSE](LICENSE).
