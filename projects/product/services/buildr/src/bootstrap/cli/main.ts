import process from 'node:process';
import fs from 'node:fs';
import { streamRemoteText } from '../../infrastructure/network/stream-remote-text.ts';
import { captureWebRestartAttempt } from '../../web/startup-context.ts';

function writeInternalDownload(file: string, bytes: Uint8Array): void {
  fs.writeFileSync(file, bytes, { flag: 'wx' });
}

async function runInternalProductAction(argv: string[]): Promise<boolean> {
  if (argv[2] !== '__internal') return false;
  const action = argv[3];
  if (process.env.BUILDR_INTERNAL_PRODUCT_REENTRY !== '1') return false;
  if (action === 'download-file') {
    const [url, output] = argv.slice(4);
    if (!url || !output) throw new Error('Internal download-file requires URL and output path.');
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    writeInternalDownload(output, Buffer.from(await response.arrayBuffer()));
    return true;
  }
  if (action === 'fetch-text') {
    const [url, timeout = '10000'] = argv.slice(4);
    if (!url) throw new Error('Internal fetch-text requires URL.');
    const timeoutMs = Number(timeout);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 180_000) throw new Error('Internal fetch-text timeout is invalid.');
    await streamRemoteText(url, timeoutMs);
    return true;
  }
  if (action === 'enroll-npm-installation') {
    const { enrollNpmInstallationFromLifecycle } = await import('../../modules/installation/module.ts');
    const result = enrollNpmInstallationFromLifecycle();
    if (result.action === 'skipped') console.warn(`Buildr npm update authority was not enrolled: ${result.reason}.`);
    else {
      try {
        const { refreshInstalledNpmLauncher } = await import('../../modules/installation/module.ts');
        const refresh: unknown = Reflect.apply(refreshInstalledNpmLauncher, undefined, [{ registration: { status: 'installed', entry: result.entry } }]);
        if (refresh && typeof refresh === 'object' && !Array.isArray(refresh) && 'action' in refresh && refresh.action === 'blocked' && 'reason' in refresh) {
          console.warn(`Buildr Web Launcher binding was not refreshed: ${String(refresh.reason)}.`);
        }
      } catch (error) {
        console.warn(`Buildr Web Launcher binding refresh failed closed: ${error instanceof Error ? error.message : String(error)}. Run buildr web launcher repair from the updated npm installation.`);
      }
    }
    return true;
  }
  throw new Error(`Unknown internal Buildr product action: ${action || '<missing>'}.`);
}

export async function runCli(argv: string[] = process.argv): Promise<unknown> {
  captureWebRestartAttempt(argv);
  if (await runInternalProductAction(argv)) return;
  if (process.env.BUILDR_TEST_FAIL_FULL_BOOTSTRAP === '1') throw new Error('Injected full runtime bootstrap failure.');
  const { dispatch } = await import('./registry.ts');
  return dispatch(argv);
}

type WebHandoffSend = (message: { type: string; code: string; message: string }, callback: () => void) => void;

// Startup failures of a detached update/restart successor must reach the
// predecessor over IPC regardless of where dispatch stopped — not only inside
// the web contribution's catch — or the handoff reports an opaque exit code.
const reportedWebHandoffFailures = new WeakSet<object>();

export function normalizeCliError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

export async function reportWebHandoffStartupFailure(
  cause: unknown,
  argv: string[] = process.argv,
  sendImpl?: WebHandoffSend,
): Promise<boolean> {
  if (!argv.includes('--update-handoff') && !argv.includes('--restart')) return false;
  const error = normalizeCliError(cause);
  if (reportedWebHandoffFailures.has(error)) return false;
  reportedWebHandoffFailures.add(error);
  const send: WebHandoffSend | null = sendImpl || (typeof process.send === 'function' && process.connected ? (message, callback) => { void process.send!(message, callback); } : null);
  if (!send) return false;
  await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, 250);
    try {
      send({ type: 'buildr.web-update-handoff-failed', code: typeof (error as any).code === 'string' ? (error as any).code : 'web_update_process_failed', message: String(error.message || error).slice(0, 4096) }, () => { clearTimeout(timer); resolve(); });
    } catch { clearTimeout(timer); resolve(); }
  });
  return true;
}

export async function reportCliFailure(cause: unknown, argv: string[] = process.argv): Promise<never> {
  await reportWebHandoffStartupFailure(cause, argv);
  const error = normalizeCliError(cause);
  const fields = Object.fromEntries(Object.entries(error));
  const code = typeof fields.code === 'string' ? fields.code : '';
  const usage = typeof fields.usage === 'string' ? fields.usage : '';
  const nextAction = typeof fields.nextAction === 'string' ? fields.nextAction : '';
  const structuredInputError = code.startsWith('task_record_cli.') || Boolean(usage);
  if (argv.includes('--json') && structuredInputError) {
    const payload = {
      schemaVersion: 'buildr.cli-error/v1',
      error: { code, message: error.message, ...(fields.details === undefined ? {} : { details: fields.details }) },
      suggestions: nextAction ? [nextAction] : [],
      help: usage || 'buildr --help',
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(process.env.BUILDR_DEBUG_STACK === '1' && error.stack ? error.stack : `${code ? `[${code}] ` : ''}${error.message}`);
    if (usage) console.error(`Usage: ${usage}`);
    if (nextAction) console.error(`Next: ${nextAction}`);
  }
  process.exit(structuredInputError ? 2 : 1);
}
