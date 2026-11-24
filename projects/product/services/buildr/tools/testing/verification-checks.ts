import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const node = (script: string, ...args: string[]) => ({ file: process.execPath, args: [path.resolve(root, script), ...args], cwd: '.' });

/** Generated inputs are explicit preparation, shared once by checks in one execution. */
export const sharedCheckPreparation = [
  node('tools/development/prepare-development-agent.ts', '--reuse-build'),
  ...['task-dto', 'task-professional-dto', 'runtime-system-dto', 'workbench-dto', 'workspace-agent-assets-dto']
    .map(name => node(`tools/codegen/contracts/${name}.ts`)),
  node('tools/testing/test-context-build.ts', 'generate'),
];

export const serviceVerificationChecks = [
  {id:'development-live-browser',type:'E2E',name:'Same-origin Development browser stylesheet HMR without host restart',
    sourcePaths:['test/e2e/development-live.ts','tools/development/dev-*','src/web/http/**','services/buildr-web/vite.config.ts','services/buildr-web/src/main.tsx','services/buildr-web/src/styles.css','services/buildr-harness-web/tools/dev-server.mjs'],
    command:node('tools/development/run-isolated-workspace-check.ts','--script',path.join(root,'test/e2e/development-live.ts')),
    resources:['browser-runtime'],schedulingCostMs:45000,timeoutMs:120000,prepare:sharedCheckPreparation},
  {id:'development-live-recovery',type:'Integration',name:'Development live supervisor adoption, rollback and Harness continuity',
    sourcePaths:['test/e2e/development-live.ts','tools/development/dev-*','src/web/http/**','services/buildr-harness/src/process/**'],
    command:node('tools/development/run-isolated-workspace-check.ts','--script',path.join(root,'test/e2e/development-live.ts'),'--','--recovery'),
    schedulingCostMs:90000,timeoutMs:300000,prepare:sharedCheckPreparation},
 {id:'harness-frame-browser',type:'E2E',name:'Development composes the complete Harness conversation',sourcePaths:['src/web/http/**','services/buildr-web/src/features/harness-ui/**','services/buildr-harness-web/src/**'],command:{file:process.execPath,args:['tools/development/run-isolated-workspace-check.ts','--script','test/e2e/harness-frame.ts'],cwd:'.'},resources:['browser-runtime'],schedulingCostMs:60000,timeoutMs:180000},
  {
    id: 'harness-products-consumption', type: 'E2E', name: 'Real Harness and Development package coexistence and retained restart',
    sourcePaths: ['src/**', 'services/buildr-harness/**', 'services/buildr-harness/**', 'services/buildr-harness-web/**', 'services/buildr-harness-web/**'],
    command: node('tools/development/run-isolated-workspace-check.ts', '--script', path.join(root, 'test/e2e/harness-products.ts'), '--', '--active-uninstall'),
    requiredEnvironment: ['BUILDR_HARNESS_ARTIFACT', 'BUILDR_DEVELOPMENT_ARTIFACT'],
    selection: 'explicit-only',
    timeoutMs: 360000,
    requirements: ['Two exact offline tarballs; active execution uninstall/reinstall uses a native-program fixture, never a paid provider or live account. No publication.'],
  },
  {
    id: 'test-syntax', type: 'Static', name: 'All service test and helper JavaScript/TypeScript syntax',
    sourcePaths: ['test/**', 'tools/testing/test-syntax.ts', 'services/buildr-web/test/**', 'services/buildr-harness-web/test/**', 'services/buildr-harness-web/test/**', 'services/buildr-harness/test/**', 'services/buildr-harness/test/**', 'services/dsh-plugin/test/**'],
    command: node('tools/testing/test-syntax.ts'),
  },
  {
    id: 'test-typecheck', type: 'Static', name: 'Buildr, Web and Agent TypeScript tests and helpers',
    sourcePaths: ['test/**', 'tools/testing/**', 'tsconfig*.json', 'services/buildr-web/test/**', 'services/buildr-harness-web/test/**', 'services/buildr-harness/test/**'],
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
    sourcePaths: ['src/**', 'tools/codegen/**', 'services/buildr-harness/src/index.ts'],
    command: node('tools/testing/check-generated.ts'), prepare: sharedCheckPreparation,
  },
] as const;
