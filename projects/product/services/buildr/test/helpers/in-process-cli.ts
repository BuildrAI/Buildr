import assert from 'node:assert/strict';
import process from 'node:process';

/**
 * Runs the real CLI entry (`runCli`) inside the current test process.
 *
 * The command string, argument parsing, JSON/human output, error reporting and
 * exit status all come from the same production entry as `bin/buildr.mjs`. Only
 * the ~1.6s Node process start per command is removed, so application-behaviour
 * journeys do not pay a cold process for every assertion.
 *
 * Real child-process coverage stays with the dedicated process contracts
 * (`init-onboarding`, `repository-onboarding`, `cli-compatibility`,
 * `task-commits`) and with the explicit parity assertion each converted file
 * keeps through `runBuildr`.
 */

const EXIT_SENTINEL: any = Symbol('buildr-cli-exit');

type CliResult = { status: number; stdout: string; stderr: string };

type RunOptions = {
  env?: Record<string, string | undefined>;
  cwd?: string;
};

function applyEnvironment(overrides: Record<string, string | undefined>): () => void {
  const saved: Array<[string, string | undefined]> = [];
  for (const [key, value] of Object.entries(overrides)) {
    saved.push([key, process.env[key]]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

export async function runCliInProcess(args: readonly string[], expected?: number, options: RunOptions = {}): Promise<CliResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalStdoutWrite: any = process.stdout.write;
  const originalStderrWrite: any = process.stderr.write;
  const originalExit: any = process.exit;
  const originalExitCode: any = process.exitCode;
  const originalCwd: string = process.cwd();
  const restoreEnvironment: any = applyEnvironment(options.env ?? {});
  let status: number = 0;
  (process.stdout as any).write = (chunk: any): boolean => { stdout.push(String(chunk)); return true; };
  (process.stderr as any).write = (chunk: any): boolean => { stderr.push(String(chunk)); return true; };
  (process as any).exit = (code?: number): never => {
    throw { [EXIT_SENTINEL]: true, code: typeof code === 'number' ? code : 0 };
  };
  process.exitCode = undefined;
  if (options.cwd) process.chdir(options.cwd);
  try {
    const { runCli, reportCliFailure }: any = await import('../../src/bootstrap/cli/main.ts');
    const argv: string[] = ['node', 'buildr', ...args];
    try {
      await runCli(argv);
    } catch (error: any) {
      if (error && error[EXIT_SENTINEL]) {
        status = error.code;
      } else {
        // `reportCliFailure` renders the production error output and then calls
        // `process.exit`, which the stub above turns into an exit sentinel.
        try {
          await reportCliFailure(error, argv);
        } catch (reported: any) {
          status = reported && reported[EXIT_SENTINEL] ? reported.code : 1;
        }
      }
    }
    if (status === 0 && typeof process.exitCode === 'number') status = process.exitCode;
  } finally {
    (process.stdout as any).write = originalStdoutWrite;
    (process.stderr as any).write = originalStderrWrite;
    (process as any).exit = originalExit;
    process.exitCode = originalExitCode;
    if (process.cwd() !== originalCwd) process.chdir(originalCwd);
    restoreEnvironment();
  }
  const result: CliResult = { status, stdout: stdout.join(''), stderr: stderr.join('') };
  if (expected !== undefined) assert.equal(result.status, expected, `buildr ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

export async function runCliJsonInProcess(args: readonly string[], expected?: number, options: RunOptions = {}): Promise<any> {
  const result: CliResult = await runCliInProcess([...args, '--json'], expected, options);
  return JSON.parse(result.stdout);
}
