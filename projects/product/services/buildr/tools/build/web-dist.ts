import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const webRoot = path.resolve(serviceRoot, '../buildr-web');

export function inspectLocalWebToolchain(root = webRoot): {
  status: 'ready' | 'blocked';
  root: string;
  tools: { typescript: string | null; vite: string | null };
  missing: string[];
} {
  const executable = (name: string): string | null => {
    const base = path.join(root, 'node_modules', '.bin', name);
    const candidates = process.platform === 'win32' ? [`${base}.cmd`, base] : [base];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  };
  const tools = { typescript: executable('tsc'), vite: executable('vite') };
  const missing = Object.entries(tools).filter(([, value]) => !value).map(([name]) => name);
  return { status: missing.length ? 'blocked' : 'ready', root, tools, missing };
}

export function buildWebDist(outputRoot: string, root = webRoot): string {
  const target = path.resolve(outputRoot);
  const toolchain = inspectLocalWebToolchain(root);
  if (toolchain.status !== 'ready') {
    throw Object.assign(new Error(`Buildr Web local toolchain is not current: ${toolchain.missing.join(', ')}; restore the declared buildr-web preparation recipe before building.`), {
      code: 'web_dist_local_toolchain_missing',
      details: toolchain,
    });
  }
  fs.rmSync(target, { recursive: true, force: true });
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const args = [...(npmExecPath ? [npmExecPath] : []), '--prefix', root, 'run', 'build', '--', '--outDir', target];
  const result = spawnSync(command, args, { cwd: serviceRoot, encoding: 'utf8', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw Object.assign(new Error(`Buildr Web staging build failed with exit code ${result.status ?? 'unknown'}: ${(result.stderr || result.stdout || '').trim()}`), {
      code: 'web_dist_build_failed',
    });
  }
  return target;
}
