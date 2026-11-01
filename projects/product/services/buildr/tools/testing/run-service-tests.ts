import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveVerificationWorkerBudget } from '../../test/verification/worker-budget.ts';
import { resolveNodeTestFiles } from '../../test/verification/test-files.ts';

/** Service-owned discovery and execution share exactly the same selectors. */
export function serviceTestArguments(selectors: readonly string[], { cwd = process.cwd(), maximumWorkers = Number.MAX_SAFE_INTEGER, env = process.env } = {}) {
  const files: string[] = resolveNodeTestFiles(cwd, selectors, 'Service tests');
  const budget = resolveVerificationWorkerBudget({ env, fallback: 1, maximum: Number.MAX_SAFE_INTEGER, label: 'Service tests' });
  const workers = Math.min(files.length, maximumWorkers, budget);
  const integration = files.some(file => file.includes(`${path.sep}test${path.sep}integration${path.sep}`));
  const reporters = integration ? ['--test-reporter=spec', '--test-reporter-destination=stdout',
    `--test-reporter=${pathToFileURL(path.resolve(import.meta.dirname, '../../test/verification/integration-progress-reporter.ts')).href}`,
    '--test-reporter-destination=stderr'] : [];
  return ['--test', `--test-concurrency=${workers}`, ...reporters, ...files];
}

export function runServiceTests(selectors: readonly string[], options: { cwd?: string; maximumWorkers?: number; env?: NodeJS.ProcessEnv } = {}) {
  const args = serviceTestArguments(selectors, options);
  const result = spawnSync(process.execPath, args, { cwd: options.cwd ?? process.cwd(), env: options.env ?? process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = runServiceTests(process.argv.slice(2));
}
