import path from 'node:path';

import { executeFinishRun, inspectFinishRun, readFinishRun, resolveFinishRun } from './task-finish-run.mjs';

function inputError(code, message, action) {
  const error = new Error(message);
  Object.assign(error, { code, usage: `buildr help task finish ${action}`, nextAction: `buildr help task finish ${action}` });
  return error;
}

function assertArgs(action, args) {
  const allowedByAction = {
    run: new Set(['--run', '--task', '--agent', '--target-branch', '--remote', '--resume', '--target', '--detail', '--json']),
    inspect: new Set(['--run', '--target', '--detail', '--json']),
  };
  const allowed = allowedByAction[action];
  if (!allowed) throw inputError('task_finish.unsupported_action', `Task Finish only supports run and inspect: ${action || '<missing>'}`, 'run');
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!option.startsWith('--') || !allowed.has(option)) throw inputError('task_finish.unknown_parameter', `Unknown argument: ${option}`, action);
    if (option === '--json') continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw inputError('task_finish.missing_parameter', `Missing value for ${option}`, action);
    index += 1;
  }
}

export function registerTaskFinishApplication(runtime) {
  const optionValue = (...args) => runtime.optionValue(...args);
  const withResolvedTarget = (...args) => runtime.withResolvedTarget(...args);

  async function run(command) {
    const root = command.targetRoot;
    const runId = optionValue(command.args, '--run', null);
    const resumeToken = optionValue(command.args, '--resume', null);
    let finishRun = null;
    if (runId) {
      try { finishRun = readFinishRun({ root, runId }); } catch { /* create below */ }
    }
    if (!finishRun) {
      const task = optionValue(command.args, '--task', null);
      if (!task) throw inputError('task_finish.missing_parameter', 'Task Finish run requires --task <task-id>.', 'run');
      const context = runtime.resolveTaskEnvironmentExecution(root, task);
      if (!context?.ready) throw inputError(context?.blocked?.code || 'task_finish.not_task_environment', context?.blocked?.message || 'Task Finish requires a ready Task Environment.', 'run');
      const development = runtime.inspectTaskDevelopment(root, task);
      const receipt = development.development?.receipt;
      if (!receipt || development.development?.applicability?.handoff !== 'current') throw inputError('task_finish.development_handoff_not_current', 'Task Finish requires a current formal Development handoff.', 'run');
      const handoff = [...receipt.handoffs].reverse().find((item) => item.candidate.identity === receipt.candidate?.identity
        && JSON.stringify(item.gates) === JSON.stringify(receipt.gates)
        && JSON.stringify(item.decision) === JSON.stringify(receipt.decision));
      if (!handoff) throw inputError('task_finish.development_handoff_not_current', 'Task Finish could not resolve the current immutable Development handoff snapshot.', 'run');
      const repository = context.repositories?.find((entry) => entry.selector === 'workspace') || context.repositories?.[0] || {};
      const workspaceNodeIdentity = runtime.workspaceNodeExecution(context.validationRoot).identity?.digest;
      if (!workspaceNodeIdentity) throw inputError('task_finish.workspace_node_unavailable', 'Task Finish requires a receipt-bound Workspace Node identity.', 'run');
      const targetBranch = optionValue(command.args, '--target-branch', repository.startPoint || null);
      if (!targetBranch) throw inputError('task_finish.target_branch_unavailable', 'Task Finish could not derive the target branch; pass --target-branch.', 'run');
      const requestedAgent = optionValue(command.args, '--agent', context.controller.adapter);
      if (requestedAgent !== context.controller.adapter) throw inputError('task_finish.environment_mismatch', 'Task Finish agent must match the Task Environment adapter.', 'run');
      finishRun = resolveFinishRun({
        root,
        runId,
        resumeToken,
        identity: {
          task,
          handoffIdentity: handoff.identity,
          candidateIdentity: handoff.candidate.identity,
          contentTargetIdentity: handoff.candidate.contentTargetIdentity,
          agent: requestedAgent,
          targetBranch,
          remote: optionValue(command.args, '--remote', repository.remote || null),
          environmentRoot: context.validationRoot,
          workspaceRoot: context.workspaceRoot,
          workspaceNodeIdentity,
        },
      });
    } else if (path.resolve(finishRun.identity.workspaceRoot) !== path.resolve(root)) throw inputError('task_finish.environment_mismatch', 'Task Finish run is bound to a different canonical Workspace.', 'run');
    const { createTaskFinishProductHandlers } = await import('./task-finish-product-executor.mjs');
    const handlers = createTaskFinishProductHandlers({ runtime, root: finishRun.identity.environmentRoot });
    return print(await executeFinishRun({ root, run: finishRun, handlers, resumeToken }), command.args);
  }

  function inspect(command) {
    const runId = optionValue(command.args, '--run', null);
    if (!runId) throw inputError('task_finish.missing_parameter', 'Task Finish inspect requires --run.', 'inspect');
    return print(inspectFinishRun({ root: command.targetRoot, runId }), command.args);
  }

  function print(result, args) {
    if (args.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      console.log(`Task Finish run ${result.runId}: ${result.status}`);
      if (result.primaryFailure) console.log(`Failure: ${result.primaryFailure.phase}/${result.primaryFailure.operation || result.primaryFailure.check || 'unknown'} - ${result.primaryFailure.message}`);
      if (result.nextWorkflow) console.log(`Next workflow: ${result.nextWorkflow}`);
      else if (result.nextAction) console.log(`Next: ${result.nextAction}`);
      else console.log('Next: none');
    }
    return result;
  }

  async function taskFinish(action, args) {
    assertArgs(action, args);
    const command = withResolvedTarget(args);
    return action === 'run' ? run(command) : inspect(command);
  }

  Object.assign(runtime, { taskFinish });
}
