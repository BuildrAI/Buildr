/** Preserve the user's write order; each response is the authoritative post-write snapshot. */
export function createPreferenceWriteQueue() {
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  return {
    get pending() { return pending; },
    settled() { return tail; },
    run<T>(operation: () => Promise<T>): Promise<T> {
      pending += 1;
      const result = tail.then(operation);
      tail = result.then(() => {}, () => {}).finally(() => { pending -= 1; });
      return result;
    },
  };
}
