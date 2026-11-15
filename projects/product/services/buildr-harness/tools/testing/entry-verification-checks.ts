import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const node = (script: string, ...args: string[]) => ({
  file: process.execPath, args: [path.join(root, script), ...args], cwd: '.',
});

export const serviceVerificationChecks = [
  {
    id: 'harness-cli-browser-safety', type: 'Unit', name: 'Browser launch error redacts login ticket and releases caller',
    sourcePaths: ['src/cli.ts'], testFiles: ['test/entry/cli-browser-redaction.test.ts'],
    command: {file: process.execPath, args: ['--test', 'test/entry/cli-browser-redaction.test.ts'], cwd: '.'},
  },
  {
    id: 'harness-cli-readonly', type: 'Integration', name: 'Harness help, version and pre-runtime host requirement',
    sourcePaths: ['src/cli.ts', 'bin/**', 'package.json'], testFiles: ['test/entry/cli-readonly.test.ts'],
    command: {file: process.execPath, args: ['--test', 'test/entry/cli-readonly.test.ts'], cwd: '.'},
  },
  {
    id: 'harness-cli-typecheck', type: 'Static', name: 'Harness CLI and distribution tool types',
    sourcePaths: ['src/**', 'tools/**', 'test/entry/**', 'tsconfig*.json', 'package.json'],
    command: node('node_modules/typescript/bin/tsc', '--project', 'tsconfig.check.json'),
  },
  {
    id: 'harness-distribution-evidence', type: 'Integration', name: 'Packaged license source identity and tamper detection',
    sourcePaths: ['src/distribution*.ts', 'tools/collect-third-party.ts', 'tools/inspect-artifact-distribution.ts', 'LICENSE', 'resources/**'],
    testFiles: ['test/entry/distribution-evidence.test.ts', 'test/entry/distribution-artifact.test.ts'],
    command: {file: process.execPath, args: ['--test', 'test/entry/distribution-evidence.test.ts', 'test/entry/distribution-artifact.test.ts'], cwd: '.'},
  },
  {
    id: 'harness-distribution-policy', type: 'Unit', name: 'Artifact-specific distribution decisions',
    sourcePaths: ['src/distribution.ts'], testFiles: ['test/entry/distribution.test.ts'],
    command: {file: process.execPath, args: ['--test', 'test/entry/distribution.test.ts'], cwd: '.'},
  },
  {
    id: 'harness-windows-wrapper', type: 'Unit', name: 'Windows launcher argument and script safety',
    sourcePaths: ['src/windows-launcher.ts', 'src/launcher-binding.ts'], testFiles: ['test/entry/windows-launcher-format.test.ts'],
    command: {file: process.execPath, args: ['--test', 'test/entry/windows-launcher-format.test.ts'], cwd: '.'},
  },
  {
    id: 'harness-windows-native', type: 'Integration', name: 'Native Windows shortcut execution and identity',
    platforms: ['windows'],
    platformEvidence: [{
      id: 'harness-shortcut', stepId: 'harness-windows-native',
      dependency: 'Windows PowerShell and WScript.Shell native .lnk execution',
      risk: 'Shortcut quoting, executable binding or ownership differs from the portable script fixture.',
      proof: 'services/buildr-harness/test/native/windows-launcher.test.ts',
      inputs: ['services/buildr-harness/src/windows-launcher.ts', 'services/buildr-harness/src/launcher-binding.ts'],
    }],
    sourcePaths: ['src/*launcher*.ts'], testFiles: ['test/entry/native/windows-launcher.test.ts'],
    command: {file: process.execPath, args: ['--test', 'test/entry/native/windows-launcher.test.ts'], cwd: '.'},
    requirements: ['Windows native PowerShell and WScript.Shell; fixture entry evidence does not prove real model or whole-product acceptance.'],
  },
  {
    id: 'harness-launcher-ownership', type: 'Integration', name: 'Harness launcher binding and uninstall ownership',
    sourcePaths: ['src/launcher.ts', 'src/launcher-binding.ts', 'src/cli.ts'], testFiles: ['test/entry/launcher.test.ts'],
    command: {file: process.execPath, args: ['--test', 'test/entry/launcher.test.ts'], cwd: '.'},
    requirements: ['Filesystem evidence only; actual OS launch and other platforms require their own acceptance.'],
  },
] as const;
