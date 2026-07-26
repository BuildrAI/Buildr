import { advanceFinishRun, compactFinishCheckpoint, createFinishRun, executeSafeFinishRun, finalizeFinishCleanup, inspectFinishRun, prepareFinishCleanup, readFinishRun, renewFinishLease, resumeFinishRun } from './task-finish-run.mjs';

function values(args, name) {
  const result = [];
  for (let index = 0; index < args.length; index += 1) if (args[index] === name) result.push(args[index + 1]);
  return result;
}

function jsonValue(value, label) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { throw new Error(`${label} must be valid JSON`); }
}

function fingerprints(args) {
  return Object.fromEntries(values(args, '--fingerprint').map((entry) => {
    const separator = entry.indexOf('=');
    if (separator < 1) throw new Error('--fingerprint must use <step>=<value>');
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
}

export function registerTaskFinishApplication(runtime) {
  const optionValue = (...args) => runtime.optionValue(...args);
  const withResolvedTarget = (...args) => runtime.withResolvedTarget(...args);

  function taskFinish(action, args) {
    const command = withResolvedTarget(args);
    const root = command.targetRoot;
    const runId = optionValue(command.args, '--run');
    if (!runId) throw new Error('Missing value for --run');
    if (action === 'cleanup-finalize') return print(finalizeFinishCleanup({ root, runId, evidence: jsonValue(optionValue(command.args, '--evidence', null), '--evidence') }), command.args);
    if (action === 'inspect') return print(inspectFinishRun(readFinishRun({ root, runId })), command.args);
    if (action === 'renew') return print(renewFinishLease({ root, runId, attemptToken: optionValue(command.args, '--attempt') }), command.args);
    let run;
    try { run = readFinishRun({ root, runId }); }
    catch (error) {
      if (!['advance', 'run'].includes(action)) throw error;
      run = createFinishRun({ root, runId, task: optionValue(command.args, '--task'), change: optionValue(command.args, '--change', null), targetBranch: optionValue(command.args, '--target-branch'), remote: optionValue(command.args, '--remote', 'origin') });
    }
    if (action === 'run') return executeSafeFinishRun({ root, runId: run.runId, fingerprints: fingerprints(command.args), executionPlans: jsonValue(optionValue(command.args, '--execution-plans', null), '--execution-plans') || {} }).then((result) => print(result, command.args));
    if (action === 'cleanup-prepare') return print(prepareFinishCleanup({ root, runId: run.runId, attemptToken: optionValue(command.args, '--attempt'), evidence: jsonValue(optionValue(command.args, '--evidence', null), '--evidence') }), command.args);
    const options = {
      root, runId: run.runId, fingerprints: fingerprints(command.args),
      outcome: optionValue(command.args, '--outcome', null), attemptToken: optionValue(command.args, '--attempt', null),
      effect: jsonValue(optionValue(command.args, '--effect', null), '--effect'), evidence: jsonValue(optionValue(command.args, '--evidence', null), '--evidence'),
      blocked: jsonValue(optionValue(command.args, '--blocked', null), '--blocked'),
      session: jsonValue(optionValue(command.args, '--session', null), '--session'),
      expectedTargetRef: optionValue(command.args, '--expected-target-ref', null),
      observedTargetRef: optionValue(command.args, '--observed-target-ref', null),
      refTransition: jsonValue(optionValue(command.args, '--ref-transition', null), '--ref-transition'),
      executionPlan: jsonValue(optionValue(command.args, '--execution-plan', null), '--execution-plan'),
    };
    return print(action === 'resume' ? resumeFinishRun(options) : advanceFinishRun(options), command.args);
  }

  function print(result, args) {
    if (args.includes('--json')) {
      const checkpoint = Array.isArray(result.completedEffects) && result.timing;
      console.log(JSON.stringify(checkpoint && !(args.includes('--detail') && optionValue(args, '--detail') === 'full') ? compactFinishCheckpoint(result) : result, null, 2));
    }
    else {
      console.log(`Task Finish run ${result.runId}: ${result.status}`);
      console.log(result.nextAction ? `Next: ${result.nextAction.step} - ${result.nextAction.action}` : 'Next: none');
      if (result.blocked?.length) console.log(`Blocked: ${result.blocked.map((item) => `${item.step}: ${item.reason || item.code}`).join('; ')}`);
    }
    return result;
  }

  Object.assign(runtime, { taskFinish });
}
