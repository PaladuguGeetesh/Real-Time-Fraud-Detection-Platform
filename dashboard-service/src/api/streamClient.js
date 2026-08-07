export function createTransactionStream() {
  // EventSource has its own separate withCredentials flag -- axios's
  // withCredentials (api/client.js) has no effect on it. Without this,
  // the browser opens the SSE connection with no auth cookie attached
  // at all, and the now-protected /api/stream rejects it with 401.
  return new EventSource('http://localhost:4000/api/stream', { withCredentials: true });
}
