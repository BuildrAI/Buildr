import path from 'node:path';
import process from 'node:process';
import { sharedCheckPreparation } from '../../../buildr/tools/testing/verification-checks.ts';

const root = path.resolve(import.meta.dirname, '../..');
const runner = path.resolve(root, '../buildr/tools/testing/run-service-tests.ts');
/** Each integration file has one primary owner. The public full entry consumes this catalogue. */
export const agentIntegrationChecks = [
  { id: 'agent-integration', name: 'Agent storage, conversations and local service contracts',
    testFiles: ['test/integration/*.test.ts'], schedulingCostMs: 40000, timeoutMs: 90000,
    resourceDemand: { workers: 2, processes: 2 } },
  { id: 'agent-integration-native', name: 'Agent native executor and model protocols',
    testFiles: ['test/integration/executors/**/*.test.ts'], schedulingCostMs: 15000, timeoutMs: 60000,
    resourceDemand: { workers: 2, processes: 2 } },
  { id: 'agent-integration-startup', name: 'Agent real process startup, host exits and ownership',
    testFiles: ['test/integration/process/startup/*.test.ts'], schedulingCostMs: 40000, timeoutMs: 90000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
  { id: 'agent-integration-handoff', name: 'Agent real retained generations and question handoff',
    testFiles: ['test/integration/process/handoff/*.test.ts'], schedulingCostMs: 45000, timeoutMs: 90000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
  { id: 'agent-integration-recovery', name: 'Agent real observation, cancellation and resource release',
    testFiles: ['test/integration/process/recovery/*.test.ts'], schedulingCostMs: 60000, timeoutMs: 120000,
    resourceDemand: { workers: 1, processes: 1, workspaceIo: 1 }, resources: ['agent-process-tests'] },
].map(group => ({ ...group, type: 'Integration',
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
