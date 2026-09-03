import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultScenario: any = path.join(serviceRoot, 'tools/development/workspace-smoke.ts');

function parseArguments(argv: any): any  {
  if (argv.length === 0) return { scenario: defaultScenario, scenarioArgs: [] };
  if (argv[0] !== '--script' || !argv[1]) {
    throw new Error('Usage: run-isolated-workspace-smoke.ts [--script <node-script> [-- <args...>]]');
  }
  const separator: any = argv[2] === '--' ? 3 : 2;
  return { scenario: path.resolve(argv[1]), scenarioArgs: argv.slice(separator) };
}

let temporaryRoot: any = null;
let cleanup: any = 'not-started';
let exitCode: any = 1;
let status: any = 'failed';
let failure: any = null;

try {
  const { scenario, scenarioArgs }: any = parseArguments(process.argv.slice(2));
  if (!fs.statSync(scenario).isFile()) throw new Error(`Smoke scenario is not a file: ${scenario}`);

  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-workspace-smoke-'));
  fs.writeFileSync(path.join(temporaryRoot, '.buildr-smoke-owner'), `${process.pid}\n`, { mode: 0o600 });
  const child: any = spawnSync(process.execPath, [scenario, ...scenarioArgs], {
    cwd: serviceRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      BUILDR_NODE: process.execPath,
      BUILDR_SMOKE_ROOT: temporaryRoot,
      BUILDR_SMOKE_WORKSPACE_ROOT: path.join(temporaryRoot, 'workspace'),
      BUILDR_APP_DATA_DIR: path.join(temporaryRoot, 'app-data'),
      BUILDR_PRODUCT_DATA_DIR: path.join(temporaryRoot, 'product-data'),
      BUILDR_LOCAL_APP_NO_OPEN: '1',
    },
  });
  if (child.error) throw child.error;
  exitCode = Number.isInteger(child.status) ? child.status : 1;
  status = exitCode === 0 ? 'passed' : 'failed';
  if (child.signal) failure = `Smoke scenario terminated by ${child.signal}.`;
} catch (error: any) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  if (temporaryRoot) {
    try {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
      cleanup = fs.existsSync(temporaryRoot) ? 'failed' : 'cleaned';
    } catch (error: any) {
      cleanup = 'failed';
      failure = failure || (error instanceof Error ? error.message : String(error));
    }
  }
}

if (cleanup !== 'cleaned') {
  status = 'failed';
  exitCode = 1;
}
if (failure) process.stderr.write(`${failure}\n`);
process.stdout.write(`${JSON.stringify({
  schemaVersion: 'buildr.workspace-smoke-run/v1',
  status,
  exitCode,
  cleanup,
  temporaryRoot,
})}\n`);
process.exitCode = exitCode;
