const CODE = '[A-Za-z0-9][A-Za-z0-9._-]*';
const TASK_ID = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';
const ok = (body: unknown) => ({ status: 200, body });

export function createDailyProgressHttpContribution(application: any) {
  return Object.freeze({
    id: 'task.daily-progress.http',
    async handle({ request, suffix, searchParams, root }: any) {
      const taskDailyProgressMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/daily-progress$`));
      if (request.method === 'GET' && taskDailyProgressMatch) return ok(application.inspectTaskDailyProgress(root, taskDailyProgressMatch[1]));

      const projectDailyProgressTodayMatch = suffix.match(new RegExp(`^/projects/(${CODE})/daily-progress$`));
      const projectDailyProgressDateMatch = suffix.match(new RegExp(`^/projects/(${CODE})/daily-progress/(\\d{4}-\\d{2}-\\d{2})$`));
      if (request.method === 'GET' && (projectDailyProgressTodayMatch || projectDailyProgressDateMatch)) {
        const extra = [...searchParams.keys()].filter((field: any) => field !== 'group');
        if (extra.length) {
          const error: Error & Record<string, any> = new Error('每日演进 API 只接受 group query。');
          error.code = 'daily_progress_query_forbidden';
          error.status = 400;
          error.details = { field: extra[0] };
          throw error;
        }
        const project = (projectDailyProgressTodayMatch || projectDailyProgressDateMatch)[1];
        const date = projectDailyProgressDateMatch?.[2] || undefined;
        return ok(application.inspectProjectDailyProgress(root, {
          project,
          date,
          group: searchParams.get('group') || undefined,
        }));
      }

      return null;
    },
  });
}
