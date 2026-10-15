export function resultCell(value: unknown): string {
  if (value === null) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}
