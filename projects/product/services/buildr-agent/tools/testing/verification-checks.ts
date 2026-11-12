import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import { sharedCheckPreparation } from '../../../buildr/tools/testing/verification-checks.ts';

const root = path.resolve(import.meta.dirname, '../..');
const processTests = (group: string, omit: string) => fs.globSync(`test/integration/process/${group}/*.test.ts`, { cwd: root }).filter(file => path.basename(file) !== omit).sort();
const rootTests = fs.globSync('test/integration/*.test.ts', { cwd: root }).filter(file => path.basename(file) !== 'conversations.test.ts').sort();
const runner = path.resolve(root, '../buildr/tools/testing/run-service-tests.ts');
/** Each integration file has one primary owner. The public full entry consumes this catalogue. */
export const agentIntegrationChecks = [
  { id: 'agent-integration', name: 'Agent storage, conversations and local service contracts',
    testFiles: rootTests, schedulingCostMs: 120000, timeoutMs: 180000,
    // Database/cache/filesystem lifecycles are real IO, not a lightweight model protocol.
    resourceDemand: { workers: 2, processes: 2, workspaceIo: 2 } },
  { id: 'agent-integration-conversations', name: 'Agent conversation lifecycle and authenticated input contracts',
    testFiles: ['test/integration/conversations.test.ts'], schedulingCostMs: 50000, timeoutMs: 90000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 } },
  { id: 'agent-integration-native', name: 'Agent native executor and model protocols',
    testFiles: ['test/integration/executors/**/*.test.ts'], schedulingCostMs: 90000, timeoutMs: 180000,
    resourceDemand: { workers: 2, processes: 2 } },
  { id: 'agent-integration-startup', name: 'Agent real process startup, host exits and ownership',
    testFiles: processTests('startup', 'ownership.test.ts'), schedulingCostMs: 55000, timeoutMs: 90000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
  { id: 'agent-integration-startup-ownership', name: 'Agent real host exits and retained ownership',
    testFiles: ['test/integration/process/startup/ownership.test.ts'], schedulingCostMs: 80000, timeoutMs: 120000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
  { id: 'agent-integration-handoff', name: 'Agent real retained generations and question handoff',
    // Activation owns the expensive upgrade chain separately; each file still has one primary owner.
    testFiles: processTests('handoff', 'activation.test.ts'), schedulingCostMs: 120000, timeoutMs: 180000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
  { id: 'agent-integration-handoff-activation', name: 'Agent retained runtime activation and failed successor recovery',
    testFiles: ['test/integration/process/handoff/activation.test.ts'], schedulingCostMs: 100000, timeoutMs: 180000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
  { id: 'agent-integration-recovery', name: 'Agent real observation, cancellation and resource release',
    testFiles: processTests('recovery','protocol-budget.test.ts'), schedulingCostMs: 240000, timeoutMs: 420000,
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
    ...(['agent-integration-native', 'agent-integration-conversations'].includes(group.id)
      ? ['src/process/runtime-unit.ts', 'src/process/runtime-preparation.ts'] : []),
    // Real lifecycle fixtures inject first/second controlled executors in
    // test/integration/fixtures/agent-process-entry.mjs. Provider protocol
    // behavior belongs to native + conversation owners, not these fixtures.
    ...(group.id.startsWith('agent-integration-startup') || group.id.startsWith('agent-integration-handoff') || group.id.startsWith('agent-integration-recovery')
      ? ['src/executors/codex/**', 'src/executors/dsh/**', 'src/executors/qoder/**', 'src/executors/qoder-cn/**'] : []),
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
