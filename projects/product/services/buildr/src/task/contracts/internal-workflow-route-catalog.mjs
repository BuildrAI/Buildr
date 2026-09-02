export const REQUIRED_INTERNAL_WORKFLOW_ROUTES = Object.freeze([
  Object.freeze({ id: 'task-retrospective', runner: 'task-retrospective-driver.mjs', source: 'src/task/interfaces/internal/task-retrospective-driver.mjs', mode: 'read-write' }),
]);

export function inspectRequiredInternalWorkflowRoutes() {
  return {
    schemaVersion: 'buildr.internal-workflow-route-inventory/v1',
    status: 'ready',
    routes: REQUIRED_INTERNAL_WORKFLOW_ROUTES.map((route) => ({ ...route })),
  };
}
