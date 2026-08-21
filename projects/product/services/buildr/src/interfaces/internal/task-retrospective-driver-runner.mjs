function option(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

function optionValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    values.push(value);
  }
  return values;
}

const USAGE = 'Internal usage: buildr __internal task-retrospective list --target <canonical-workspace> [--status <pending|handled|no-action|all>] [--task <task-id> ...] [--limit <count>] [--include-report]\n       buildr __internal task-retrospective <inspect|record|handle> --task <task-id> --target <canonical-workspace> [--report-markdown <text>] [--status <pending|handled|no-action> --note <text> --expected-current-digest <digest>]';

export async function runTaskRetrospectiveDriver(args, options = {}) {
  const stdout = options.stdout || ((value) => console.log(value));
  const stderr = options.stderr || ((value) => console.error(value));
  const action = args[0];
  const taskId = option(args, '--task');
  const targetRoot = option(args, '--target');
  if (!['list', 'inspect', 'record', 'handle'].includes(action) || !targetRoot || (action !== 'list' && !taskId)) {
    stderr(USAGE);
    return 2;
  }

  try {
    const { createRuntime } = await import('../../bootstrap/runtime.mjs');
    const runtime = createRuntime();
    const output = action === 'list'
      ? runtime.listTaskRetrospectives(targetRoot, {
          status: option(args, '--status'),
          taskIds: optionValues(args, '--task'),
          limit: option(args, '--limit') === undefined ? undefined : Number(option(args, '--limit')),
          includeReport: args.includes('--include-report'),
        })
      : action === 'inspect'
        ? runtime.inspectTaskRetrospective(targetRoot, taskId)
        : action === 'record'
          ? runtime.recordTaskRetrospective(targetRoot, taskId, { reportMarkdown: option(args, '--report-markdown') })
          : runtime.handleTaskRetrospective(targetRoot, taskId, {
              status: option(args, '--status'),
              note: option(args, '--note'),
              expectedCurrentDigest: option(args, '--expected-current-digest'),
            });
    stdout(JSON.stringify(output, null, 2));
    return 0;
  } catch (error) {
    stderr(JSON.stringify({
      schemaVersion: 'buildr.task-retrospective-driver-error/v1',
      status: 'blocked',
      diagnostic: { code: error.code || 'task_retrospective_driver_failed', message: error.message, details: error.details },
      nextActions: error.nextAction ? [error.nextAction] : [],
    }, null, 2));
    return 1;
  }
}
