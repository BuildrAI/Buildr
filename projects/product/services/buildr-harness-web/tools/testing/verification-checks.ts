import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
export const serviceVerificationChecks = [
  {
    id: 'harness-standalone-browser', type: 'E2E', name: 'Standalone production UI and real source HTTP with isolated executor fixture',
    sourcePaths: ['src/**', 'services/buildr-harness-ui/**', 'services/buildr-agent/**'],
    behaviorOnlyInputs: ['services/buildr-harness-ui/**', 'services/buildr-agent/**'],
    testFiles: ['test/browser/*.test.ts'],
    command: {file: process.execPath, args: ['--test', 'test/browser/*.test.ts'], cwd: '.'},
    requirements: ['Prepared core package with current standalone production assets and Playwright Chromium; no real model/account acceptance is implied.'],
    timeoutMs: 150000,
  },
  {
    id: 'harness-web-build', type: 'Static', name: 'Standalone Harness production shell and shared UI build',
    sourcePaths: ['src/**', 'index.html', 'mermaid-renderer.html', 'vite.config.ts', 'package.json', 'tsconfig.json', 'services/buildr-harness-ui/**'],
    command: {file: process.execPath, args: [path.join(root, 'tools/build.ts')], cwd: '.'},
    requirements: ['Uses the formal Vite build; this does not claim browser or model execution acceptance.'],
  },
  {
    id: 'harness-web-boundaries', type: 'Static', name: 'Standalone shell dependency and delivery boundaries',
    sourcePaths: ['src/**', 'package.json', 'vite.config.ts', 'LICENSE'], testFiles: ['test/*.test.ts'],
    command: {file: process.execPath, args: ['--test', 'test/*.test.ts'], cwd: '.'},
  },
] as const;
