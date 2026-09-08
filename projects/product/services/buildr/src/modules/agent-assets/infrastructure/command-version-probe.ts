import { buildCommandInvocation, findExecutableOnPath, spawnSync } from '../../../infrastructure/process.ts';
import { parseVersion } from '../domain/command-version.ts';

export { findExecutableOnPath };

export function buildCommandProbeInvocation(executablePath: string, args: string[], options: Record<string, unknown> = {}) {
  return buildCommandInvocation(executablePath, args, options);
}

export function probeCommandVersion(executablePath: string, args: string[], options: any = {}) {
  const invocation = buildCommandProbeInvocation(executablePath, args, options);
  const spawn = options.spawn || spawnSync;
  const result = spawn(invocation.executable, invocation.args, {
    encoding: 'utf8', timeout: 5000, windowsHide: true, shell: invocation.shell,
  });
  if (result.error) return {
    status: 'spawn-failed', invocation,
    error: { code: result.error.code || null, message: result.error.message },
  };
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const currentVersion = parseVersion(output);
  return { status: currentVersion ? 'parsed' : 'unknown', invocation, output, currentVersion };
}
