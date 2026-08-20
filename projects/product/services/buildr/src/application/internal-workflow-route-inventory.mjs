export const REQUIRED_INTERNAL_WORKFLOW_ROUTES = Object.freeze([
  Object.freeze({ id: 'task-development', runner: 'task-development-driver-runner.mjs', mode: 'read-write' }),
  Object.freeze({ id: 'task-retrospective', runner: 'task-retrospective-driver-runner.mjs', mode: 'read-write' }),
  Object.freeze({ id: 'task-planning-identity', runner: 'task-planning-identity-driver-runner.mjs', mode: 'read-only' }),
]);

export function inspectRequiredInternalWorkflowRoutes() {
  return {
    schemaVersion: 'buildr.internal-workflow-route-inventory/v1',
    status: 'ready',
    routes: REQUIRED_INTERNAL_WORKFLOW_ROUTES.map((route) => ({ ...route })),
  };
}
