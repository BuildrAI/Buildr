// @ts-nocheck -- Legacy JavaScript boundary migrated to a single TypeScript source; typing is outside this change.
import path from 'node:path';
import process from 'node:process';

export function parentCoordinationCommand(runtime, args) {
  let taskId = null;
  try {
    let targetRoot = process.cwd();
    for (let index = 0; index < args.length; index += 1) {
      const value = args[index];
      if (value === '--target') {
        if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('--target requires a workspace path.');
        targetRoot = path.resolve(args[++index]);
      } else if (value === '--json') continue;
      else if (value.startsWith('--') || taskId) throw new Error(`Unknown argument: ${value}`);
      else taskId = value;
    }
    if (!taskId) throw new Error('task parent inspect requires a task id.');
    const payload = runtime.inspectParentCoordination(targetRoot, taskId);
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  } catch (error) {
    const payload = { schemaVersion: 'buildr.parent-coordination-result/v4', operation: 'inspect', status: 'blocked', taskId,
      diagnostic: { code: error.code || 'parent_coordination_cli.syntax', message: error.message }, effects: [] };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 1;
    return payload;
  }
}
