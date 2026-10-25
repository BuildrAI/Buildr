import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const node = (script: string, ...args: string[]) => ({ file: process.execPath, args: [path.resolve(root, script), ...args], cwd: '.' });

/** Generated inputs are explicit preparation, shared once by checks in one execution. */
export const sharedCheckPreparation = [
  node('tools/development/prepare-development-agent.ts'),
  ...['task-dto', 'task-professional-dto', 'runtime-system-dto', 'workbench-dto', 'workspace-agent-assets-dto']
    .map(name => node(`tools/codegen/contracts/${name}.ts`)),
  node('tools/testing/test-context-build.ts', 'generate'),
];

export const serviceVerificationChecks = [
  {
    id: 'test-syntax', type: 'Static', name: 'All service test and helper JavaScript/TypeScript syntax',
    sourcePaths: ['test/**', 'tools/testing/test-syntax.ts', 'services/buildr-web/test/**', 'services/buildr-agent/test/**', 'services/dsh-plugin/test/**'],
    command: node('tools/testing/test-syntax.ts'),
  },
  {
    id: 'test-typecheck', type: 'Static', name: 'Buildr, Web and Agent TypeScript tests and helpers',
    sourcePaths: ['test/**', 'tools/testing/**', 'tsconfig*.json', 'services/buildr-web/test/**', 'services/buildr-agent/test/**'],
    command: node('tools/testing/run-types.ts', '--project', 'tsconfig.tests.json'), prepare: sharedCheckPreparation,
    requirements: ['Strict TypeScript checking includes test helpers and browser journeys; JavaScript files receive syntax checks.'],
  },
  {
    id: 'unit', type: 'Unit', name: 'Buildr complete isolated internal-function tests',
    sourcePaths: ['src/**', 'tools/**', 'resources/**'], testFiles: ['test/unit/*.test.ts'],
    command: { file: process.execPath, args: ['--import', './test/register-development-entry.ts', 'tools/testing/run-service-tests.ts', 'test/unit/*.test.ts'], cwd: '.' },
    prepare: sharedCheckPreparation,
  },
  {
    id: 'source-contracts', type: 'Static', name: 'Buildr source, declaration and resource conformance',
    sourcePaths: ['src/**', 'tools/**', 'resources/**', 'package.json'], testFiles: ['test/static/*.test.ts'],
    command: { file: process.execPath, args: ['--import', './test/register-development-entry.ts', 'tools/testing/run-service-tests.ts', 'test/static/*.test.ts'], cwd: '.' },
    prepare: sharedCheckPreparation,
  },
  {
    id: 'typecheck', type: 'Static', name: 'Buildr production and tool TypeScript types',
    sourcePaths: ['src/**', 'tools/**', 'tsconfig.json', 'package.json'],
    command: node('tools/testing/run-types.ts', '--project', 'tsconfig.json'), prepare: sharedCheckPreparation,
  },
  {
    id: 'generated-contracts', type: 'Static', name: 'Generated public types match their owning declarations',
    sourcePaths: ['src/**', 'tools/codegen/**'], command: node('tools/testing/check-generated.ts'), prepare: sharedCheckPreparation,
  },
] as const;
