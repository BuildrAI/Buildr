import { inspectFinishRun, readTaskFinishResults } from './task-finish-run.mjs';
import { reconcileTaskFinishMaintenance } from './task-finish-maintenance.mjs';
import { projectTaskFinishResult } from './task-finish-result-projection.mjs';
import { projectTaskFinishCurrentFacts, withTaskFinishCurrentFacts } from './task-finish-current-facts.mjs';

function inputError(code, message) {
  return Object.assign(new Error(message), { code, status: 400, usage: 'buildr help task finish inspect', nextAction: '使用 task-finish 技能处理当前成果；历史只通过 task finish inspect 读取。' });
}

export function registerTaskFinishApplication(runtime) {
  const optionValue = (...args) => runtime.optionValue(...args);
  function inspect(command) {
    const runId = optionValue(command.args, '--run', null);
    if (!runId) throw inputError('task_finish.missing_parameter', 'Task Finish inspect requires --run.', 'inspect');
    return print(inspectFinishRun({ root: command.targetRoot, runId, runtime }), command.args);
  }

  function print(result, args) {
    if (args.includes('--json')) {
      const detail = optionValue(args, '--detail', 'compact');
      process.stdout.write(`${JSON.stringify(projectTaskFinishResult(result, detail), null, 2)}\n`);
    }
    else {
      console.log(`Task Finish run ${result.runId}: ${result.status}`);
      if (result.occupancy?.status === 'released') console.log('Occupancy: released');
      if (result.primaryFailure) console.log(`Failure: ${result.primaryFailure.phase}/${result.primaryFailure.operation || result.primaryFailure.check || 'unknown'} - ${result.primaryFailure.message}`);
      if (result.nextWorkflow) console.log(`Next workflow: ${result.nextWorkflow}`);
      else if (result.nextAction) console.log(`Next: ${result.nextAction}`);
      else console.log('Next: none');
    }
    return result;
  }

  function inspectTaskFinishReadModel({ root, taskId, clock = Date.now }) {
    try {
      const current = runtime.readTaskFinishRunPersistence?.(root, { taskId }, { optional: true });
      if (current) {
        const result = inspectFinishRun({ root, runId: current.run.runId, clock, runtime });
        return { taskId, state: 'current', result, completion: current.preparedCompletion || null, facts: result.currentFacts };
      }
      const terminal = readTaskFinishResults({ root, taskId, clock, runtime });
      if (terminal.results.length > 0) {
        const stored = terminal.results[0].result;
        const result = withTaskFinishCurrentFacts(stored, { taskId, operation: 'inspect' });
        return { taskId, state: 'terminal', result, completion: terminal.results[0].completion, diagnostics: terminal.diagnostics, facts: result.currentFacts };
      }
      const facts = projectTaskFinishCurrentFacts({ taskId, operation: 'inspect', diagnostics: terminal.diagnostics });
      return { taskId, state: 'none', result: null, completion: null, diagnostics: terminal.diagnostics, facts };
    } catch (error) {
      const diagnostics = [{ code: error.code || 'task_finish_read_unavailable', message: error.message }];
      return { taskId, state: 'none', result: null, completion: null, diagnostics, facts: projectTaskFinishCurrentFacts({ taskId, operation: 'inspect', diagnostics }) };
    }
  }

  function refreshTaskFinishMaintenance(root, taskId, options = {}) {
    try {
      return reconcileTaskFinishMaintenance({ runtime, root, taskId, runId: options.runId || null, selfBootstrapResult: options.selfBootstrapResult || null, clock: options.clock || Date.now });
    } catch (error) {
      if (!options.runId && error.code === 'task_finish.maintenance_state_missing') return { schemaVersion: 'buildr.task-finish-maintenance-reconciliation-result/v1', operation: 'maintenance', status: 'skipped', taskId, runId: null, reason: 'no-matching-finish-state' };
      throw error;
    }
  }

  async function taskFinish(action, args) {
    if (action !== 'inspect') throw inputError('task_finish.execution_retired', '旧收尾执行入口已退役；任务、成果和资源保持原样。');
    const detail = optionValue(args, '--detail', 'compact');
    if (!['compact', 'full', 'self-bootstrap'].includes(detail)) throw inputError('task_finish.detail_invalid', '历史查询 detail 仅支持 compact、full 或 self-bootstrap。');
    const flags = new Set(['--run', '--target', '--detail']);
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === '--json') continue;
      if (!flags.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw inputError('task_finish.invalid_argument', `历史查询不支持参数：${args[i]}`);
      i += 1;
    }
    return inspect(runtime.withResolvedTarget(args));
  }
  Object.assign(runtime, {
    taskFinish, refreshTaskFinishMaintenance, inspectTaskFinishReadModel,
    readTaskFinishResults: ({ root, taskId, clock = Date.now }) => readTaskFinishResults({ root, taskId, clock, runtime }),
  });
}
