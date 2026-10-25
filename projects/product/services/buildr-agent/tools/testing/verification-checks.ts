import path from 'node:path';
import process from 'node:process';
import { sharedCheckPreparation } from '../../../buildr/tools/testing/verification-checks.ts';

const root = path.resolve(import.meta.dirname, '../..');
const runner = path.resolve(root, '../buildr/tools/testing/run-service-tests.ts');
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
  {
    id: 'agent-integration', type: 'Integration', name: 'Agent storage, native-process protocols and recovery',
    sourcePaths: ['src/**', 'tools/**', 'package.json'], testFiles: ['test/integration/**/*.test.ts'],
    command: { file: process.execPath, args: [runner, 'test/integration/**/*.test.ts'], cwd: '.' },
    prepare: [{ ...sharedCheckPreparation[0], cwd: '../buildr' }],
    replaces: ['agent-service'],
  },
] as const;
