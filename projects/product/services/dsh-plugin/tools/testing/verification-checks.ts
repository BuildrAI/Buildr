import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const runner = path.resolve(root, '../buildr/tools/testing/run-service-tests.ts');
const sdkFiles = ['activation', 'binding-maintenance-native', 'configuration-owner', 'composition-lifecycle', 'sdk-source'];
const packageFiles = ['client-metadata-native', 'package-composition', 'built-variants'];
const peerFiles = ['source-business-gateway'];
const integrationFiles = fs.readdirSync(path.join(root, 'test/integration'))
  .filter(file => file.endsWith('.test.ts') && ![...sdkFiles, ...packageFiles, ...peerFiles].includes(file.slice(0, -'.test.ts'.length)))
  .sort().map(file => `test/integration/${file}`);

export const serviceVerificationChecks = [
  {
    id: 'plugin-source-structure', type: 'Static', name: 'DSH source and variant declarations',
    sourcePaths: ['.github/workflows/publish-dsh-plugin.yml', 'plugin/**', 'tools/**', 'package.json'], testFiles: ['test/static/*.test.ts'],
    command: { file: process.execPath, args: [runner, 'test/static/*.test.ts'], cwd: '.' },
  },
  {
    id: 'plugin-unit', type: 'Unit', name: 'DSH plugin complete isolated internal logic',
    sourcePaths: ['.github/workflows/publish-dsh-plugin.yml', 'plugin/**', 'tools/**', 'package.json', 'test/helpers/variant-identity.ts'], testFiles: ['test/unit/*.test.ts'],
    command: { file: process.execPath, args: [runner, 'test/unit/*.test.ts'], cwd: '.' },
  },
  {
    id: 'plugin-typecheck', type: 'Static', name: 'DSH host and client types against the prepared SDK',
    sourcePaths: ['.github/workflows/publish-dsh-plugin.yml', 'plugin/**', 'tools/**', 'sdk-patches/**', 'package.json'],
    command: { file: process.execPath, args: [path.join(root, 'tools/build-plugin.ts'), '--typecheck-only'], cwd: '.' },
    requiredEnvironment: ['BUILDR_DSH_SOURCE_SDK_ROOT'],
    selection: 'explicit-only',
    requirements: ['Explicit integrity-verified source SDK; no SDK download, package bundle or desktop activation.', 'Release and candidate verification runs this against the prepared SDK; ordinary source checks omit it because an unprepared machine cannot prove it.'],
  },
  {
    id: 'plugin-test-typecheck', type: 'Static', name: 'DSH TypeScript tests and helpers against the exact SDK',
    sourcePaths: ['test/**', 'plugin/**', 'tools/**', 'sdk-patches/**', 'package.json'],
    command: { file: process.execPath, args: [path.join(root, 'tools/testing/check-test-types.ts')], cwd: '.' },
    requiredEnvironment: ['BUILDR_DSH_SOURCE_SDK_ROOT', 'BUILDR_DSH_SOURCE_UI_CONSUMER_ROOT'],
    selection: 'explicit-only',
    requirements: ['Strict typing per entry preserves distinct Host and Client SDK declarations; uses existing generated protocol declarations.', 'Release and candidate verification runs this against the prepared SDK and generated Client consumer.'],
  },
  {
    id: 'plugin-integration', type: 'Integration', name: 'DSH real files, Git, child processes and local transport',
    sourcePaths: ['.github/workflows/publish-dsh-plugin.yml', 'plugin/**', 'tools/**', 'package.json'], testFiles: integrationFiles,
    command: { file: process.execPath, args: [runner, ...integrationFiles], cwd: '.' },
  },
  {
    id: 'plugin-sdk-integration', type: 'Integration', name: 'DSH native loader and source SDK contracts',
    sourcePaths: ['.github/workflows/publish-dsh-plugin.yml', 'plugin/**', 'tools/**', 'sdk-patches/**'], testFiles: sdkFiles.map(name => `test/integration/${name}.test.ts`),
    command: { file: process.execPath, args: [runner, ...sdkFiles.map(name => `test/integration/${name}.test.ts`)], cwd: '.' },
    requiredEnvironment: ['BUILDR_DSH_SOURCE_SDK_ROOT'],
  },
  {
    id: 'plugin-peer-integration', type: 'Integration', name: 'DSH source capture against the exact Buildr peer',
    sourcePaths: ['.github/workflows/publish-dsh-plugin.yml', 'plugin/**', 'tools/**'], testFiles: peerFiles.map(name => `test/integration/${name}.test.ts`),
    command: { file: process.execPath, args: [runner, ...peerFiles.map(name => `test/integration/${name}.test.ts`)], cwd: '.' },
    requiredEnvironment: ['BUILDR_DSH_BUILDR_PEER_MANIFEST'],
  },
  {
    id: 'plugin-ui-integration', type: 'Integration', name: 'DSH host-provided UI composition and plugin interaction',
    sourcePaths: ['.github/workflows/publish-dsh-plugin.yml', 'plugin/src/**', 'tools/**'], testFiles: ['test/integration/source-ui.client.spec.tsx'],
    command: { file: process.execPath, args: [path.join(root, 'test/integration/run-source-ui.ts')], cwd: '.' },
    requiredEnvironment: ['BUILDR_DSH_SOURCE_UI_SDK_ROOT', 'BUILDR_DSH_SOURCE_UI_CONSUMER_ROOT'],
  },
  {
    id: 'plugin-package-integration', type: 'Integration', name: 'DSH built package structure and native Client protocol',
    sourcePaths: ['.github/workflows/publish-dsh-plugin.yml', 'plugin/**', 'tools/**', 'sdk-patches/**', 'package.json', 'test/helpers/variant-identity.ts'],
    testFiles: packageFiles.map(name => `test/integration/${name}.test.ts`),
    command: { file: process.execPath, args: [runner, ...packageFiles.map(name => `test/integration/${name}.test.ts`)], cwd: '.' },
    requiredEnvironment: ['BUILDR_DSH_SOURCE_SDK_ROOT', 'BUILDR_DSH_COMPOSITION_ROOT', 'BUILDR_DSH_COMPOSITION_DEV_ROOT', 'BUILDR_DSH_BUNDLE_ROOT'],
  },
  {
    id: 'plugin-native-e2e', type: 'E2E', name: 'DSH actual released and development package loading',
    sourcePaths: ['.github/workflows/publish-dsh-plugin.yml', 'plugin/**', 'tools/**', 'sdk-patches/**', 'package.json'],
    testFiles: ['test/e2e/coexistence.test.ts'],
    command: { file: process.execPath, args: [runner, 'test/e2e/coexistence.test.ts'], cwd: '.' },
    requiredEnvironment: ['BUILDR_DSH_SOURCE_SDK_ROOT', 'BUILDR_DSH_BUNDLE_ROOT'],
    requirements: ['Exact prepared SDK and isolated actual package outputs; these inputs are never borrowed from a real desktop profile.'],
  },
] as const;
