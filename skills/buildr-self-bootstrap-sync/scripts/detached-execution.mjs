import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workerFile = fileURLToPath(import.meta.url);
const defaultRunner = fileURLToPath(new URL('./closeout.mjs', import.meta.url));

/** Only the original runner owns activation, locks and recovery. This process
 * boundary lets that runner finish after the initiating agent/host disappears.
 * @param {{args:string[],runnerModule?:string,onHandoff?:(evidence:{schemaVersion:string,pid:number|undefined,resultFile:string,logFile:string})=>void}} options
 */
export async function runDetachedCloseout({ args, runnerModule = defaultRunner, onHandoff = () => {} }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-self-bootstrap-execution-'));
  fs.chmodSync(directory, 0o700);
  const requestFile = path.join(directory, 'request.json');
  const resultFile = path.join(directory, 'result.json');
  const logFile = path.join(directory, 'worker.log');
  fs.writeFileSync(requestFile, JSON.stringify({ runnerModule, args }), { mode: 0o600 });
  const log = fs.openSync(logFile, 'wx', 0o600);
  let child;
  try {
    child = spawn(process.execPath, [workerFile, requestFile], {
      cwd: process.cwd(), env: process.env,
      detached: true, windowsHide: true, stdio: ['ignore', log, log],
    });
  } finally {
    fs.closeSync(log);
  }
  // A regular child (or inherited stdout pipe) still dies when the old agent
  // executor shuts down its process group. Do not depend on either lifetime.
  child.unref();
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  // Spawn failure is also reported by the ready promise below; observe both.
  void completed.catch(() => {});
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  onHandoff({ schemaVersion: 'buildr.self-bootstrap-execution/v1', pid: child.pid, resultFile, logFile });
  // Keep only the waiting caller alive; killing it must not affect the worker.
  const keepWaiting = setInterval(() => {}, 1000);
  let exit;
  try { exit = await completed; }
  finally { clearInterval(keepWaiting); }
  if (!fs.existsSync(resultFile)) {
    const error = new Error('独立自举执行器退出但未保存结果；保留日志与原恢复信息，不能认定激活成功。');
    Object.assign(error, { code: 'self-bootstrap-closeout.worker-result-missing', details: { ...exit, resultFile, logFile } });
    throw error;
  }
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  if (exit.code !== (result.status === 'blocked' ? 1 : 0)) {
    const error = new Error('独立自举执行器的退出状态与结果不一致。');
    Object.assign(error, { code: 'self-bootstrap-closeout.worker-exit-mismatch', details: { ...exit, resultFile, logFile } });
    throw error;
  }
  // Preserve the CLI's existing error stream and exception semantics as well
  // as the runner's normal blocked-result protocol.
  if (fs.existsSync(path.join(directory, 'driver-error'))) {
    const error = new Error(result.diagnostic.message);
    Object.assign(error, { code: result.diagnostic.code, details: result.diagnostic.details });
    throw error;
  }
  return result;
}

async function worker(requestFile) {
  const directory = path.dirname(requestFile);
  const resultFile = path.join(directory, 'result.json');
  let result;
  try {
    const { runnerModule, args } = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    const { runSelfBootstrapCloseoutCommand } = await import(pathToFileURL(runnerModule).href);
    result = await runSelfBootstrapCloseoutCommand({ args });
  } catch (error) {
    result = {
      schemaVersion: 'buildr.self-bootstrap-closeout-result/v1', status: 'blocked',
      diagnostic: { code: error.code || 'self-bootstrap-closeout.driver-failed', message: error.message, details: error.details || null },
    };
    fs.writeFileSync(path.join(directory, 'driver-error'), '', { mode: 0o600 });
  }
  // The file is an execution output, never an alternative delivery authority.
  // Publish atomically so a later conversation can read an intact final result.
  fs.writeFileSync(`${resultFile}.tmp`, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(`${resultFile}.tmp`, resultFile);
  fs.unlinkSync(requestFile);
  process.exitCode = result.status === 'blocked' ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === workerFile) {
  await worker(process.argv[2]);
}
