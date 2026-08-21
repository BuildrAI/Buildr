function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

const USAGE = 'Internal usage: buildr __internal task-planning-identity inspect --task <task-id> --target <canonical-workspace>';

export async function runTaskPlanningIdentityDriver(args, options = {}) {
  const stdout = options.stdout || ((value) => console.log(value));
  const stderr = options.stderr || ((value) => console.error(value));
  const action = args[0];
  const taskId = option(args, '--task');
  const targetRoot = option(args, '--target');
  if (action !== 'inspect' || !taskId || !targetRoot) {
    stderr(USAGE);
    return 2;
  }

  try {
    const { createRuntime } = await import('../../bootstrap/runtime.mjs');
    const result = createRuntime().inspectTaskPlanningIdentity(targetRoot, taskId);
    stdout(JSON.stringify(result, null, 2));
    return result.status === 'blocked' ? 1 : 0;
  } catch (error) {
    stderr(JSON.stringify({
      schemaVersion: 'buildr.task-planning-identity-driver-error/v1',
      operation: 'inspect',
      status: 'blocked',
      taskId,
      diagnostic: { code: error.code || 'task_planning_identity_driver_failed', message: error.message, details: error.details },
      effects: [],
      nextActions: [error.nextAction || '检查driver参数与Buildr runtime composition后重试。'],
    }, null, 2));
    return 1;
  }
}
