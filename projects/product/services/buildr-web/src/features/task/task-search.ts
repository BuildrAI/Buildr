const EXACT_TASK_QUERY = /^#[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export function isIndexedTaskQuery(value: string): boolean {
  if (value === '' || EXACT_TASK_QUERY.test(value)) return true;
  const tokens = [...new Set(value.toLowerCase().split(/[^0-9a-z\u0080-\uffff]+/u).filter(Boolean))];
  return tokens.length > 0 && tokens.every((token) => [...token].length >= 3);
}
