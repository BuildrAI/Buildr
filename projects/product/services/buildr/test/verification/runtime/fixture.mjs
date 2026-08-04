import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export class RuntimeVerificationHarness {
  constructor(options = {}) {
    this.buildr = options.buildr ?? path.join(productRoot, 'bin', 'buildr.mjs');
    this.commandTimings = new Map();
    this.temporaryRoots = new Set();
  }

  recordCommandTiming(args, startedAt) {
    const key = args.slice(0, 2).join(' ');
    const current = this.commandTimings.get(key) ?? { count: 0, durationMs: 0 };
    this.commandTimings.set(key, { count: current.count + 1, durationMs: current.durationMs + Date.now() - startedAt });
  }

  run(args, options = {}) {
    const startedAt = Date.now();
    const result = spawnSync(process.execPath, [this.buildr, ...args], {
      cwd: productRoot,
      encoding: 'utf8',
      env: { ...process.env, ...(options.env || {}) },
    });
    this.recordCommandTiming(args, startedAt);
    if (!options.allowFailure && result.status !== 0) throw new Error(`${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
    return result;
  }

  runAsync(args, options = {}) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const child = spawn(process.execPath, [this.buildr, ...args], {
        cwd: productRoot,
        env: { ...process.env, ...(options.env || {}) },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (status) => {
        this.recordCommandTiming(args, startedAt);
        const result = { status, stdout, stderr };
        if (!options.allowFailure && status !== 0) reject(new Error(`${args.join(' ')} failed:\n${stdout}\n${stderr}`));
        else resolve(result);
      });
    });
  }

  createTemporaryDirectory(prefix) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    this.temporaryRoots.add(directory);
    return directory;
  }

  initializeSeed(name, prefix = 'buildr-runtime-seed-') {
    const workspace = this.createTemporaryDirectory(prefix);
    this.run(['init', '--target', workspace, '--name', name]);
    return workspace;
  }

  cloneWorkspace(seed, prefix = 'buildr-runtime-clone-') {
    const parent = this.createTemporaryDirectory(prefix);
    const workspace = path.join(parent, 'workspace');
    fs.cpSync(seed, workspace, { recursive: true });
    return workspace;
  }

  timingSummary() {
    return [...this.commandTimings.entries()]
      .sort((left, right) => right[1].durationMs - left[1].durationMs)
      .map(([command, timing]) => `${command}=${timing.durationMs}ms/${timing.count}`)
      .join(', ');
  }

  cleanup() {
    for (const root of [...this.temporaryRoots].sort((left, right) => right.length - left.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    this.temporaryRoots.clear();
  }
}

export async function mapLimit(items, limit, worker) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('mapLimit requires a positive integer limit');
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  const settled = await Promise.allSettled(workers);
  const failure = settled.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results;
}

export function digestRuntime(workspace) {
  const hash = crypto.createHash('sha256');
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const item = path.join(directory, entry.name);
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
