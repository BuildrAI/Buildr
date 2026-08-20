import process from 'node:process';
import fs from 'node:fs';
import { streamRemoteText } from '../../infrastructure/network/stream-remote-text.mjs';

function writeInternalDownload(file, bytes) {
  fs.writeFileSync(file, bytes, { flag: 'wx' });
}

async function runInternalProductAction(argv) {
  if (argv[2] !== '__internal') return false;
  const action = argv[3];
  const { runRequiredInternalWorkflowRoute } = await import('../internal/formal-workflow-routes.mjs');
  const workflowExitCode = await runRequiredInternalWorkflowRoute(action, argv.slice(4));
  if (workflowExitCode !== null) {
    process.exitCode = workflowExitCode;
    return true;
  }
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
  if (action === 'task-finish-retained-cleanup') {
    const { runRetainedTaskFinishCleanup } = await import('../internal/task-finish-retained-cleanup.mjs');
    await runRetainedTaskFinishCleanup(argv.slice(4));
    return true;
  }
  if (action === 'enroll-npm-installation') {
    const { enrollNpmInstallationFromLifecycle } = await import('../../application/npm-installation-enrollment.mjs');
    const result = enrollNpmInstallationFromLifecycle();
    if (result.action === 'skipped') console.warn(`Buildr npm update authority was not enrolled: ${result.reason}.`);
    else {
      try {
        const { refreshInstalledNpmLauncher } = await import('../../infrastructure/product-launcher/index.mjs');
        const refresh = refreshInstalledNpmLauncher({ registration: { status: 'installed', entry: result.entry } });
        if (refresh.action === 'blocked') console.warn(`Buildr Web Launcher binding was not refreshed: ${refresh.reason}.`);
      } catch (error) {
        console.warn(`Buildr Web Launcher binding refresh failed closed: ${error.message}. Run buildr web launcher repair from the updated npm installation.`);
      }
    }
    return true;
  }
  throw new Error(`Unknown internal Buildr product action: ${action || '<missing>'}.`);
}

export async function runCli(argv = process.argv) {
  if (await runInternalProductAction(argv)) return;
  const { isLightweightTaskFinishCommand, runLightweightTaskFinish } = await import('./task-finish-bootstrap.mjs');
  if (isLightweightTaskFinishCommand(argv)) return runLightweightTaskFinish(argv);
  if (process.env.BUILDR_TEST_FAIL_FULL_BOOTSTRAP === '1') throw new Error('Injected full runtime bootstrap failure.');
  const { dispatch } = await import('./registry.mjs');
  return dispatch(argv);
}

export function reportCliFailure(error, argv = process.argv) {
  const structuredInputError = typeof error.code === 'string' && (error.code.startsWith('task_finish.') || error.code.startsWith('task_record_cli.') || typeof error.usage === 'string');
  if (argv.includes('--json') && structuredInputError) {
    const payload = {
      schemaVersion: 'buildr.cli-error/v1',
      error: { code: error.code, message: error.message },
      suggestions: error.nextAction ? [error.nextAction] : [],
      help: error.usage || 'buildr --help',
    };
    if (error.details !== undefined) payload.error.details = error.details;
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(process.env.BUILDR_DEBUG_STACK === '1' && error.stack ? error.stack : `${error.code ? `[${error.code}] ` : ''}${error.message}`);
    if (error.usage) console.error(`Usage: ${error.usage}`);
    if (error.nextAction) console.error(`Next: ${error.nextAction}`);
    if (error.code === 'task_finish.entry_gaps' && error.details?.gaps) {
      for (const module of ['development', 'environment', 'delivery']) {
        for (const item of error.details.gaps[module] || []) {
          console.error(`[${module}] ${item.code}: ${item.message}`);
        }
      }
    }
  }
  process.exit(structuredInputError ? 2 : 1);
}
