export function formatShortDateTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}
