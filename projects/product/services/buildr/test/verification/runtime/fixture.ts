import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export class RuntimeVerificationHarness {
  constructor(options: any = {}) {
    this.buildr = options.buildr ?? path.join(productRoot, 'bin', 'buildr.mjs');
    this.commandTimings = new Map();
    this.temporaryRoots = new Set();
  }

  recordCommandTiming(args: any, startedAt: any): any  {
    const key: any = args.slice(0, 2).join(' ');
    const current: any = this.commandTimings.get(key) ?? { count: 0, durationMs: 0 };
    this.commandTimings.set(key, { count: current.count + 1, durationMs: current.durationMs + Date.now() - startedAt });
  }

  run(args: any, options: any = {}): any  {
    const startedAt: any = Date.now();
    const result: any = spawnSync(process.execPath, [this.buildr, ...args], {
      cwd: productRoot,
      encoding: 'utf8',
      env: { ...process.env, ...(options.env || {}) },
    });
    this.recordCommandTiming(args, startedAt);
    if (!options.allowFailure && result.status !== 0) throw new Error(`${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
    return result;
  }

  runAsync(args: any, options: any = {}): any  {
    return new Promise((resolve: any, reject: any) => {
      const startedAt: any = Date.now();
      const child: any = spawn(process.execPath, [this.buildr, ...args], {
        cwd: productRoot,
        env: { ...process.env, ...(options.env || {}) },
      });
      let stdout: any = '';
      let stderr: any = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: any) => { stdout += chunk; });
      child.stderr.on('data', (chunk: any) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (status: any) => {
        this.recordCommandTiming(args, startedAt);
        const result: any = { status, stdout, stderr };
        if (!options.allowFailure && status !== 0) reject(new Error(`${args.join(' ')} failed:\n${stdout}\n${stderr}`));
        else resolve(result);
      });
    });
  }

  createTemporaryDirectory(prefix: any): any  {
    const directory: any = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    this.temporaryRoots.add(directory);
    return directory;
  }

  initializeSeed(name: any, prefix: any = 'buildr-runtime-seed-'): any  {
    const workspace: any = this.createTemporaryDirectory(prefix);
    this.run(['init', '--target', workspace, '--name', name]);
    return workspace;
  }

  cloneWorkspace(seed: any, prefix: any = 'buildr-runtime-clone-'): any  {
    const parent: any = this.createTemporaryDirectory(prefix);
    const workspace: any = path.join(parent, 'workspace');
    fs.cpSync(seed, workspace, { recursive: true });
    return workspace;
  }

  timingSummary(): any  {
    return [...this.commandTimings.entries()]
      .sort((left: any, right: any) => right[1].durationMs - left[1].durationMs)
      .map(([command, timing]: any) => `${command}=${timing.durationMs}ms/${timing.count}`)
      .join(', ');
  }

  cleanup(): any  {
    for (const root of [...this.temporaryRoots].sort((left: any, right: any) => right.length - left.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    this.temporaryRoots.clear();
  }
}

export async function mapLimit(items: any, limit: any, worker: any): Promise<any>  {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('mapLimit requires a positive integer limit');
  const results: any = new Array(items.length);
  let nextIndex: any = 0;
  const workers: any = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index: any = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  const settled: any = await Promise.allSettled(workers);
  const failure: any = settled.find((result: any) => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results;
}

export function digestRuntime(workspace: any): any  {
  const hash: any = crypto.createHash('sha256');
  const visit: any = (directory: any) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left: any, right: any) => left.name.localeCompare(right.name))) {
      const item: any = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(item);
      else if (entry.isFile()) {
        hash.update(path.relative(workspace, item));
        hash.update('\0');
        hash.update(fs.readFileSync(item));
      }
    }
  };
  for (const directory of ['.agents', '.claude', '.cursor', '.qoder', '.trae', '.codebuddy']) visit(path.join(workspace, directory));
  for (const file of ['CLAUDE.md', 'CLAUDE.local.md', 'CODEBUDDY.md', 'AGENTS.md']) {
    if (fs.existsSync(path.join(workspace, file))) hash.update(fs.readFileSync(path.join(workspace, file)));
  }
  return hash.digest('hex');
}
