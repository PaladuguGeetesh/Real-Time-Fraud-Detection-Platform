export function createTransactionStream() {
  return new EventSource('http://localhost:4000/api/stream');
}
