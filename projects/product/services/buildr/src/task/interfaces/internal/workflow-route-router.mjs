import { REQUIRED_INTERNAL_WORKFLOW_ROUTES } from '../../contracts/internal-workflow-route-catalog.mjs';

const REQUIRED_ROUTE_IDS = new Set(REQUIRED_INTERNAL_WORKFLOW_ROUTES.map((route) => route.id));

export function routeInternalWorkflow(route, args, runners, options = {}) {
  if (!REQUIRED_ROUTE_IDS.has(route)) return null;
  const runner = runners?.[route];
  if (typeof runner !== 'function') {
    const error = new Error(`Task internal workflow runner is unavailable: ${route}.`);
    error.code = 'task_internal_workflow_runner_unavailable';
    throw error;
  }
  return runner(args, options);
}
