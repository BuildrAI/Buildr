import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const buildr: any = path.join(productRoot, 'bin', 'buildr.mjs');

export function createSuiteFixture(id: any): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-workspace-e2e-${id}-`));
  const workspace: any = path.join(root, 'workspace');
  const diagnostics: any = path.join(root, 'diagnostics');
  fs.mkdirSync(diagnostics);
  return {
    root,
    workspace,
    diagnostics,
    cleanup(options: any = {}): any  {
      if (options.failed || process.env.BUILDR_WORKSPACE_E2E_KEEP === '1') {
        process.stderr.write(`[workspace-e2e] retained ${options.failed ? 'failed ' : ''}fixture: ${root}\n`);
        return;
      }
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export function runBuildr(args: any, options: any = {}): any  {
  const result: any = spawnSync(process.execPath, [buildr, ...args], {
    cwd: options.cwd ?? productRoot,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env ?? {}) },
    timeout: options.timeout ?? 120000,
  });
  const combined: any = `${result.stdout || ''}${result.stderr || ''}`;
  if (!options.allowFailure) {
    assert.equal(result.status, 0, `buildr ${args.join(' ')} failed:\n${combined || result.error?.message || 'unknown error'}`);
  }
  return { ...result, combined };
}

export function parseJson(result: any, label: any): any  {
  assert.equal(result.status, 0, `${label} failed:\n${result.combined}`);
  try {
    return JSON.parse(result.stdout);
  } catch (error: any) {
    throw new Error(`${label} did not return JSON: ${error.message}\n${result.combined}`);
  }
}

export function initializeGitRepository(directory: any): any  {
  fs.mkdirSync(directory, { recursive: true });
  const result: any = spawnSync('git', ['init', '-q'], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

export function assertHealthyDoctor(doctor: any, agent: any): any  {
  assert.equal(doctor.ok, true);
  assert.equal(doctor.summary.error, 0);
  const scopes: any = doctor.runtime?.[agent === 'claude-code' ? 'claudeCode' : agent] ?? [];
  for (const scope of scopes) {
    assert.equal(scope.counts.missing, 0, `${agent} runtime has missing assets`);
    assert.equal(scope.counts.stale, 0, `${agent} runtime has stale assets`);
    assert.equal(scope.counts.conflict, 0, `${agent} runtime has conflicts`);
  }
}
