type Read = <T>(url: string, signal: AbortSignal) => Promise<T>;
type Flight = { promise: Promise<unknown>; consumers: number; started: boolean };

/** Only in-flight JSON observations are shared; never writes, blobs or streams. */
export function sharedConversationRead(send: Read) {
  const flights = new Map<string, Flight>();
  function read<T>(url: string, signal?: AbortSignal | null): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    let flight = flights.get(url);
    if (!flight) {
      const next: Flight = { consumers: 0, started: false, promise: Promise.resolve() };
      next.promise = new Promise<void>(resolve => setTimeout(resolve, 0)).then(async () => {
        // Effect cleanup (including StrictMode's probe) can finish before any I/O.
        if (!next.consumers) throw new DOMException('Read no longer observed', 'AbortError');
        next.started = true;
        return send<T>(url, AbortSignal.timeout(15_000));
      }).finally(() => { if (flights.get(url) === next) flights.delete(url); });
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
        // A short-lived abandoned read must not poison a newly mounted consumer.
        if (!current.consumers && !current.started && flights.get(url) === current) flights.delete(url);
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
