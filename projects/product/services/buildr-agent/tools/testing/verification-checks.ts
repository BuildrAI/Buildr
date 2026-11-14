import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import { sharedCheckPreparation } from '../../../buildr/tools/testing/verification-checks.ts';

const root = path.resolve(import.meta.dirname, '../..');
const processTests = (group: string, omit: string) => fs.globSync(`test/integration/process/${group}/*.test.ts`, { cwd: root }).filter(file => path.basename(file) !== omit).sort();
const handoffTests = (...names: string[]) => names.map(name => `test/integration/process/handoff/${name}`);
const recoveryTests = (...names: string[]) => names.map(name => `test/integration/process/recovery/${name}`);
const integrationTests = (...names: string[]) => names.map(name => `test/integration/${name}`);
const executorTests = (...names: string[]) => names.map(name => `test/integration/executors/${name}`);
const storageRuntimeFiles = integrationTests(
  'component-sharing.test.ts',
  'conversation-storage.test.ts',
  'diagnostic-storage.test.ts',
  'host-contract.test.ts',
  'native-session-storage.test.ts',
  'native-state-storage.test.ts',
  'npm-cache-migration.test.ts',
  'participation-storage.test.ts',
  'preparation.test.ts',
  'process-contract-errors.test.ts',
  'process-transport.test.ts',
  'program-release.test.ts',
  'program-upgrades.test.ts',
  'qoder-cache-storage.test.ts',
  'resource-lifecycle.test.ts',
  'runtime-materialization.test.ts',
  'runtime-preparation.test.ts',
  'storage-lifecycle.test.ts',
);
const modelsAccountsFiles = integrationTests(
  'account-environment.test.ts',
  'anthropic-api.test.ts',
  'antigravity-account-access.test.ts',
  'claude-content.test.ts',
  'claude-gateway-heartbeat.test.ts',
  'connection-native-account-root.test.ts',
  'google-ai-proxy-lifecycle.test.ts',
  'model-access.test.ts',
  'model-login-completion.test.ts',
  'model-preferences.test.ts',
  'model-providers.test.ts',
  'native-content.test.ts',
  'qoder-cn-login.test.ts',
  'qoder-upgrade-pair.test.ts',
  'shared-native-models.test.ts',
);
const excludedRootTests = new Set(['test/integration/conversations.test.ts', ...storageRuntimeFiles, ...modelsAccountsFiles]);
const rootTests = fs.globSync('test/integration/*.test.ts', { cwd: root }).filter(file => !excludedRootTests.has(file)).sort();
const nativeRuntimeFiles = executorTests(
  'antigravity.test.ts',
  'claude.test.ts',
  'codex.test.ts',
  'codex-questions.test.ts',
  'dsh.test.ts',
  'dsh-client.test.ts',
  'dsh-durable.test.ts',
  'dsh-resource.test.ts',
  'dsh-stop.test.ts',
  'model-gateway.test.ts',
  'native-process.test.ts',
  'native-rpc-fairness.test.ts',
);
const nativeRuntimeSet = new Set(nativeRuntimeFiles);
const nativeTests = fs.globSync('test/integration/executors/**/*.test.ts', { cwd: root }).filter(file => !nativeRuntimeSet.has(file)).sort();
const runner = path.resolve(root, '../buildr/tools/testing/run-service-tests.ts');
/** Each integration file has one primary owner. The public full entry consumes this catalogue. */
export const agentIntegrationChecks = [
  { id: 'agent-integration-storage-runtime', name: 'Agent storage, preparation and host-runtime contracts',
    testFiles: storageRuntimeFiles, schedulingCostMs: 45000, timeoutMs: 180000,
    resourceDemand: { workers: 2, processes: 2, workspaceIo: 2 } },
  { id: 'agent-integration-models-accounts', name: 'Agent model catalogs, accounts and provider access contracts',
    testFiles: modelsAccountsFiles, schedulingCostMs: 40000, timeoutMs: 180000,
    resourceDemand: { workers: 2, processes: 2, workspaceIo: 2 } },
  { id: 'agent-integration', name: 'Agent conversations, control and Qoder service contracts',
    testFiles: rootTests, schedulingCostMs: 50000, timeoutMs: 180000,
    // Database/cache/filesystem lifecycles are real IO, not a lightweight model protocol.
    resourceDemand: { workers: 2, processes: 2, workspaceIo: 2 } },
  { id: 'agent-integration-conversations', name: 'Agent conversation lifecycle and authenticated input contracts',
    testFiles: ['test/integration/conversations.test.ts'], schedulingCostMs: 50000, timeoutMs: 90000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 } },
  { id: 'agent-integration-native-runtime', name: 'Agent native executor runtime and gateway protocols',
    testFiles: nativeRuntimeFiles, schedulingCostMs: 45000, timeoutMs: 120000,
    resourceDemand: { workers: 2, processes: 2 } },
  { id: 'agent-integration-native', name: 'Agent native executor protocols, forks and permissions',
    testFiles: nativeTests, schedulingCostMs: 45000, timeoutMs: 120000,
    resourceDemand: { workers: 2, processes: 2 } },
  { id: 'agent-integration-startup', name: 'Agent real process startup, host exits and ownership',
    testFiles: processTests('startup', 'ownership.test.ts'), schedulingCostMs: 55000, timeoutMs: 90000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
  { id: 'agent-integration-startup-ownership', name: 'Agent real host exits and retained ownership',
    testFiles: ['test/integration/process/startup/ownership.test.ts'], schedulingCostMs: 80000, timeoutMs: 120000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
  { id: 'agent-integration-handoff', name: 'Agent real queued input and question handoff',
    // Activation and retained-generation adoption each own their expensive
    // chain separately; every file still has one primary owner.
    testFiles: handoffTests('completed-input.test.ts', 'questions.test.ts'), schedulingCostMs: 70000, timeoutMs: 120000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
  { id: 'agent-integration-handoff-generations', name: 'Agent real retained generations and task association',
    testFiles: handoffTests('generations.test.ts', 'task-association.test.ts'), schedulingCostMs: 110000, timeoutMs: 180000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
  { id: 'agent-integration-handoff-activation', name: 'Agent retained runtime activation and failed successor recovery',
    testFiles: ['test/integration/process/handoff/activation.test.ts'], schedulingCostMs: 100000, timeoutMs: 180000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
  { id: 'agent-integration-recovery', name: 'Agent real observation and cancellation recovery',
    testFiles: recoveryTests('cancellation.test.ts', 'durable-completion.test.ts', 'goal-continuation.test.ts', 'observation.test.ts'),
    schedulingCostMs: 180000, timeoutMs: 300000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
  { id: 'agent-integration-recovery-resources', name: 'Agent real recovery resource release',
    testFiles: recoveryTests('resources.test.ts'), schedulingCostMs: 120000, timeoutMs: 300000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
  { id: 'agent-integration-recovery-budget', name: 'Agent real recovery backoff budget',
    testFiles: ['test/integration/process/recovery/protocol-budget.test.ts'], schedulingCostMs: 35000, timeoutMs: 60000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
].map(group => ({ ...group, type: 'Integration',
  behaviorOnlyInputs: ['src/**', 'tools/testing/verification-checks.ts'],
  // Native/conversation checks do not materialize retained runtime units.
  // Their public import/link boundary is still covered by agent-integration
  // and integration-agent-host. Shared contracts and unknown source stay broad.
  inputExclusions: [
    ...(['agent-integration-native', 'agent-integration-native-runtime', 'agent-integration-conversations'].includes(group.id)
      ? ['src/process/runtime-unit.ts', 'src/process/runtime-preparation.ts'] : []),
    // Real lifecycle fixtures inject first/second controlled executors in
    // test/integration/fixtures/agent-process-entry.mjs. Provider protocol
    // behavior belongs to native + conversation owners, not these fixtures.
    ...(group.id.startsWith('agent-integration-startup') || group.id.startsWith('agent-integration-handoff') || group.id.startsWith('agent-integration-recovery')
      ? ['src/executors/antigravity/**', 'src/executors/claude/**', 'src/executors/codex/**', 'src/executors/dsh/**', 'src/executors/qoder/**', 'src/executors/qoder-cn/**'] : []),
  ],
  sourcePaths: ['src/**', 'tools/testing/**', 'test/support/**', 'test/integration/fixtures/**', 'package.json',
    'services/buildr/tools/testing/run-service-tests.ts', 'services/buildr/test/verification/worker-budget.ts'],
  command: { file: process.execPath, args: [path.resolve(root, 'tools/testing/run-integration.ts'), '--group', group.id], cwd: '.' },
  prepare: [{ ...sharedCheckPreparation[0], cwd: '../buildr' }], replaces: ['agent-service'],
}));

export const serviceVerificationChecks = [
  {
    id: 'agent-unit', type: 'Unit', name: 'Agent event and native-history internal logic',
    sourcePaths: ['src/**', 'tools/**'], testFiles: ['test/unit/*.test.ts'],
    command: { file: process.execPath, args: [runner, 'test/unit/*.test.ts'], cwd: '.' },
  },
  {
    id: 'agent-source-boundaries', type: 'Static', name: 'Agent source dependency and public-package boundaries',
    sourcePaths: ['src/**', 'package.json'], testFiles: ['test/static/*.test.ts'],
    command: { file: process.execPath, args: [runner, 'test/static/*.test.ts'], cwd: '.' },
  },
  {
    id: 'agent-typecheck', type: 'Static', name: 'Agent production TypeScript types',
    sourcePaths: ['src/**', 'tsconfig.json', 'package.json'],
    command: { file: process.execPath, args: [path.resolve(root, '../buildr/tools/testing/run-types.ts'), '--project', 'tsconfig.json', '--noEmit'], cwd: '.' },
  },
  ...agentIntegrationChecks,
] as const;
