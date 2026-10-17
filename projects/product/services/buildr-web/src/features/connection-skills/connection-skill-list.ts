export function sortConnectionInstances<T extends { category: string }>(instances: readonly T[]): T[] {
  return [...instances].sort((left, right) => left.category.localeCompare(right.category)
    || (left.category < right.category ? -1 : left.category > right.category ? 1 : 0));
}
