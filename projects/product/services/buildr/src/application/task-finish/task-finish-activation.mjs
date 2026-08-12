import crypto from 'node:crypto';

const ROOT_RUNTIME_SOURCE = /^(?:AGENTS\.md$|rules\/|skills\/|components\/|commands\/|capabilities\.yml$|commands\.yml$)/;

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function portable(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function finishPlan(value) {
  const identity = digest({ schemaVersion: 'buildr.task-finish-activation-plan/v1', ...value });
  return { schemaVersion: 'buildr.task-finish-activation-plan/v1', ...value, identity };
}

export function planRetainedTaskFinishActivation({ agent, changedPaths = [] }) {
  const normalizedPaths = [...new Set(changedPaths.map(portable).filter(Boolean))].sort();
  const runtimePaths = normalizedPaths.filter((item) => !item.startsWith('projects/') && ROOT_RUNTIME_SOURCE.test(item));
  if (runtimePaths.length) return finishPlan({ mode: 'render-runtime', agent, matchedPaths: runtimePaths, gitEffect: 'forbidden' });
  return finishPlan({ mode: 'none', agent, matchedPaths: [], gitEffect: 'forbidden' });
}
