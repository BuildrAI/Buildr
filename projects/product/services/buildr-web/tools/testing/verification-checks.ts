import path from 'node:path';
import process from 'node:process';
import { sharedCheckPreparation } from '../../../buildr/tools/testing/verification-checks.ts';

const root = path.resolve(import.meta.dirname, '../..');
export const serviceVerificationChecks = [
  {
    id: 'frontend-logic', type: 'Unit', name: 'Buildr Web complete isolated logic and UI assembly tests',
    sourcePaths: ['src/**', 'tools/**', 'package.json'], testFiles: ['test/*.test.mjs'],
    command: { file: process.execPath, args: [path.join(root, 'tools/run-logic-tests.mjs')], cwd: '.' },
  },
  {
    id: 'frontend-typecheck', type: 'Static', name: 'Buildr Web application and Vite configuration types',
    sourcePaths: ['src/**', 'tools/**', 'tsconfig*.json', 'vite.config.ts', 'package.json'],
    command: { file: process.execPath, args: [path.resolve(root, '../buildr/tools/testing/run-types.ts'), '--build'], cwd: '.' },
    prepare: sharedCheckPreparation.map(item => ({ ...item, cwd: '../buildr' })),
  },
] as const;
