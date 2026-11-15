type Read = <T>(url: string, signal: AbortSignal) => Promise<T>;
type Flight = { promise: Promise<unknown>; consumers: number; started: boolean; url: string; abort: AbortController };

/** Only in-flight JSON observations are shared; never writes, blobs or streams. */
export function sharedJsonRead(send: Read) {
  const flights = new Map<string, Flight>();
  function read<T>(url: string, signal?: AbortSignal | null): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    let flight = flights.get(url);
    if (!flight) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(new DOMException('Read timed out', 'TimeoutError')), 15_000);
      const next: Flight = { consumers: 0, started: false, promise: Promise.resolve(), url, abort };
      next.promise = new Promise<void>(resolve => setTimeout(resolve, 0)).then(async () => {
        // Effect cleanup (including StrictMode's probe) can finish before any I/O.
        if (!next.consumers) throw new DOMException('Read no longer observed', 'AbortError');
        next.started = true;
        return send<T>(url, abort.signal);
      }).finally(() => {
        clearTimeout(timer);
        if (flights.get(url) === next) flights.delete(url);
      });
      flights.set(url, next);
      flight = next;
    }
    flight.consumers++;
    const current = flight;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (error: boolean, value: unknown) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', abort);
        current.consumers--;
        // The last observer owns the request: abandon it so a cancelled search
        // cannot keep scanning history in the background.
        if (!current.consumers) {
          if (flights.get(current.url) === current) flights.delete(current.url);
          if (current.started) current.abort.abort(new DOMException('Read no longer observed', 'AbortError'));
        }
        if (error) reject(value); else resolve(value as T);
      };
      const abort = () => finish(true, signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      current.promise.then(value => finish(false, value), error => finish(true, error));
      if (signal?.aborted) abort();
    });
  }
  // Writes separate pre-write and post-write observations without cancelling
  // existing consumers or letting an old completion clear a newer flight.
  return Object.assign(read, { invalidate: () => flights.clear() });
}
