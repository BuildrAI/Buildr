import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { registerWorkspaceInfrastructure } from '../../src/infrastructure/filesystem/index.ts';
import { copyPreparedWorkspace } from '../helpers/prepared-fixtures.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';

const service: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const source: any = fs.readFileSync(path.join(service, 'resources/workspace/AGENTS.md'), 'utf8');

const block: any = source.match(/<!-- buildr:required begin -->[\s\S]*?<!-- buildr:required end -->/)[0];

const principles: any[] = ['以目标驱动协作', '以真实工作现场为中心', '提供确定性能力，开放组合方式', '多种入口共享同一当前事实', '约束局部化，失败影响隔离', '以可信完成目标的效率衡量性能'];

const hash: any = (bytes: any) => `sha256-${crypto.createHash('sha256').update(bytes).digest('hex')}`;

function fixture(t: any, prepared = false): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-inline-core-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace: any = prepared ? copyPreparedWorkspace(t, 'legacy-core-preservation').root : path.join(root, 'workspace');
  if (!prepared) fs.mkdirSync(workspace);
  const env: any = { ...process.env, BUILDR_APP_DATA_DIR: path.join(root, 'app-data'), BUILDR_PRODUCT_DATA_DIR: path.join(root, 'product-data') };
  const runRaw: any = (args: any, cli: any = path.join(service, 'bin/buildr.mjs')) => spawnSync(process.execPath, [cli, ...args], { cwd: service, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000 });
  const run: any = (args: any, cli: any = path.join(service, 'bin/buildr.mjs')) => {
    const result: any = runRaw(args, cli);
    assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
  };
  return { root, workspace, run, runFail: runRaw, env };
}

function assertInline(workspace: any): any  {
  const actual: any = fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf8');
  assert.ok(actual.includes(block));
  for (const principle of principles) assert.ok(actual.includes(principle), principle);
  return actual;
}

function legacy(workspace: any, { modified = false, invalid = false, missing = false }: any = {}): any  {
  const target: any = 'rules/buildr/core.md';
  const old: any = '# Legacy official core\n';
  const rulesPath: any = path.join(workspace, 'rules/manifest.yml');
  fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
  fs.writeFileSync(rulesPath, invalid
    ? 'rules: [\n'
    : YAML.stringify({ schemaVersion: 'buildr.rules/v1', rules: [{ id: 'buildr-core', source: 'buildr', path: target, description: 'legacy required core', enabled: true, required: true, state: 'installed' }] }));
  fs.mkdirSync(path.join(workspace, 'rules/buildr'), { recursive: true });
  if (!missing) fs.writeFileSync(path.join(workspace, target), modified ? old + 'user changes\n' : old);
}

export { service, source, block, principles, hash, fixture, assertInline, legacy };
