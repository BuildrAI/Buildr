import process from 'node:process';

export const WEB_RESTART_ATTEMPT_ENV = 'BUILDR_WEB_RESTART_ATTEMPT';
let startupAttempt: string | undefined;

/** Narrow bootstrap port: capture before workers or the independent Agent host can spawn. */
export function captureWebRestartAttempt(argv: string[] = process.argv): void {
  const inherited = process.env[WEB_RESTART_ATTEMPT_ENV];
  delete process.env[WEB_RESTART_ATTEMPT_ENV];
  startupAttempt = argv.includes('--restart') ? inherited : undefined;
}

export function takeWebRestartAttempt(): string | undefined {
  const inherited = process.env[WEB_RESTART_ATTEMPT_ENV];
  delete process.env[WEB_RESTART_ATTEMPT_ENV];
  const token = startupAttempt ?? inherited;
  startupAttempt = undefined;
  return token;
}
