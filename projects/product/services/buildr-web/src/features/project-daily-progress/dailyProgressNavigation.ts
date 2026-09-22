export type DailyProgressGroup = 'day' | 'person' | 'task';

export function dailyProgressGroup(value: string | null): DailyProgressGroup {
  return value === 'person' || value === 'task' ? value : 'day';
}

export function localDailyProgressDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function isDailyProgressDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function dailyProgressActivityPath(project = '', date = '', group: DailyProgressGroup = 'day'): string {
  const params = new URLSearchParams();
  if (project) params.set('project', project);
  if (date) params.set('date', date);
  if (group !== 'day') params.set('group', group);
  return '/activity' + (params.size ? `?${params}` : '');
}

export function legacyDailyProgressPath(project: string, search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get('document') !== 'daily') return null;
  return dailyProgressActivityPath(project, params.get('date') || localDailyProgressDate(), dailyProgressGroup(params.get('group')));
}

export function dailyProgressActionContext(project = '', date = ''): { projectCode?: string; date: string } {
  return { ...(project ? { projectCode: project } : {}), date: date || localDailyProgressDate() };
}
