export {
  REQUIRED_INTERNAL_WORKFLOW_ROUTES,
  inspectRequiredInternalWorkflowRoutes,
} from '../../application/internal-workflow-route-inventory.mjs';

export async function runRequiredInternalWorkflowRoute(route, args, options = {}) {
  if (route === 'task-development') {
    const { runTaskDevelopmentDriver } = await import('./task-development-driver-runner.mjs');
    return runTaskDevelopmentDriver(args, options);
  }
  if (route === 'task-retrospective') {
    const { runTaskRetrospectiveDriver } = await import('./task-retrospective-driver-runner.mjs');
    return runTaskRetrospectiveDriver(args, options);
  }
  if (route === 'task-planning-identity') {
    const { runTaskPlanningIdentityDriver } = await import('./task-planning-identity-driver-runner.mjs');
    return runTaskPlanningIdentityDriver(args, options);
  }
  return null;
}
