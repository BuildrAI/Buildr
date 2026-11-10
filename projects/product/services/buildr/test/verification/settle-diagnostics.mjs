/** Test-only preload. Capture bounded state at the existing public read boundary. */
import assert from 'node:assert';
import { registerHooks, syncBuiltinESMExports } from 'node:module';

const key = Symbol.for('buildr.verification.conversation-observer');
const recent = new Map();
const fields = (value, names) => Object.fromEntries(names.filter(name => value?.[name] !== undefined).map(name => [name, value[name]]));
const run = value => value ? { ...fields(value, ['id', 'participantId', 'generation', 'status', 'executionState', 'accepted']),
  tools: (value.tools ?? []).slice(-12).map(tool => fields(tool, ['id', 'status', 'canStop'])) } : null;
globalThis[key] = value => {
  try {
    const state = { observedAt: new Date().toISOString(), ...fields(value, ['id', 'workspaceId', 'revision', 'status']),
      run: run(value.run), retainedRuns: (value.retainedRuns ?? []).slice(-8).map(run),
      requests: (value.requests ?? []).slice(-8).map(request => fields(request, ['id', 'kind', 'status', 'runId', 'participantId'])),
      entryCount: value.entries?.length ?? null };
    recent.delete(state.id); recent.set(state.id, state);
    while (recent.size > 8) recent.delete(recent.keys().next().value);
  } catch { /* Observation must not alter business behavior or failure. */ }
};
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (!/buildr-agent\/(?:src|build)\/application\/conversation-application\.(?:ts|js)(?:\?|$)/u.test(url) || result.source == null) return result;
  const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
  return { ...result, source: source + `
const verificationOriginalRead = ConversationApplication.prototype.read;
ConversationApplication.prototype.read = function (...args) {
  const value = verificationOriginalRead.apply(this, args);
  globalThis[Symbol.for('buildr.verification.conversation-observer')]?.(value);
  return value;
};
` };
} });
function diagnosticFail(original) {
  return function (...args) {
    if (args.some(value => typeof value === 'string' && /state did not settle/iu.test(value))) {
      try { process.stderr.write('[buildr-state-diagnostic] ' + JSON.stringify({ pid: process.pid, observedConversations: [...recent.values()],
        failureLocation: new Error().stack?.split('\n').slice(2, 7) }) + '\n'); } catch { /* Preserve the assertion. */ }
    }
    return Reflect.apply(original, this, args);
  };
}
assert.fail = diagnosticFail(assert.fail);
assert.strict.fail = diagnosticFail(assert.strict.fail);
syncBuiltinESMExports();
