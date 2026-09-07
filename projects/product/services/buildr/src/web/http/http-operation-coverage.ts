const ALLOWED = new Set(['migrated-json', 'migrated-binary', 'deferred', 'not-applicable']);

export const NON_HTTP_SYSTEM_DISPOSITIONS = Object.freeze([
  Object.freeze({ id: 'system-doctor.cli', owner: 'system-doctor', disposition: 'not-applicable', reason: 'Doctor is a read-only CLI/Application diagnostic capability, not a Buildr Web HTTP route.' }),
  Object.freeze({ id: 'system-installation.launcher-cli', owner: 'system-installation', disposition: 'not-applicable', reason: 'Launcher install/status/repair/uninstall remain CLI/Application operations.' }),
  Object.freeze({ id: 'system-release.transaction', owner: 'release-workflow', disposition: 'not-applicable', reason: 'Protected release mutation is not exposed through Buildr Web HTTP.' }),
]);

export const DEFERRED_HTTP_OPERATIONS = Object.freeze([
  Object.freeze({ id: 'workspace.getting-started', owner: 'workspace', disposition: 'deferred', reason: 'Existing read model remains outside the migrated Workspace contract catalog.' }),
  Object.freeze({ id: 'workspace.daily-progress', owner: 'workspace', disposition: 'deferred', reason: 'Project Daily Progress retains its dedicated public JSON contract.' }),
  Object.freeze({ id: 'workspace.documents', owner: 'workspace', disposition: 'deferred', reason: 'Document reads retain path-specific security and existing response contracts.' }),
  Object.freeze({ id: 'workspace.prompts', owner: 'workspace', disposition: 'deferred', reason: 'Agent prompt generation remains an Application-specific payload.' }),
  Object.freeze({ id: 'task.change-and-ui-prototypes', owner: 'task-change', disposition: 'deferred', reason: 'Change detail and sandboxed UI prototype responses retain their dedicated authority.' }),
]);

export function ownedHttpOperations(owner: any, operations: any) {
  return operations.map((operation: any) => Object.freeze({
    owner,
    disposition: operation.responseKind === 'binary' ? 'migrated-binary' : 'migrated-json',
    responseKind: operation.responseKind || 'json',
    ...operation,
  }));
}

export function inspectHttpOperationCoverage(operationGroups: any, dispositions: any = [...DEFERRED_HTTP_OPERATIONS, ...NON_HTTP_SYSTEM_DISPOSITIONS]) {
  const entries = [...operationGroups.flat(), ...dispositions];
  const counts = new Map();
  const invalid: any[] = [];
  for (const entry of entries) {
    counts.set(entry.id, (counts.get(entry.id) || 0) + 1);
    if (!entry.id || !entry.owner || !ALLOWED.has(entry.disposition)) invalid.push(entry.id || '<missing>');
    if (['deferred', 'not-applicable'].includes(entry.disposition) && !entry.reason) invalid.push(entry.id);
    if (entry.disposition === 'migrated-json' && (!entry.requestSchemaId || !entry.successSchemaId || !entry.errorSchemaId)) invalid.push(entry.id);
    if (entry.disposition === 'migrated-binary' && (!entry.requestSchemaId || entry.successSchemaId !== null || !entry.errorSchemaId)) invalid.push(entry.id);
  }
  const duplicates = [...counts].filter(([, count]: any) => count !== 1).map(([id]: any) => id).sort();
  const blockers = [...new Set([...invalid, ...duplicates])].sort();
  return Object.freeze({
    schemaVersion: 'buildr.http-operation-coverage/v1',
    status: blockers.length ? 'blocked' : 'aligned',
    operationCount: counts.size,
    dispositions: Object.freeze(Object.fromEntries([...ALLOWED].map((item: any) => [item, entries.filter((entry: any) => entry.disposition === item).map((entry: any) => entry.id).sort()]))),
    blockers: Object.freeze(blockers),
    runtimeBlocking: false,
  });
}
