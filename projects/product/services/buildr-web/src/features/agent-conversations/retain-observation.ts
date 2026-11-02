/** Keep React's state identity when a small polling projection has not changed. */
export function retainObservation<T>(previous: T, next: T): T {
  return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}
