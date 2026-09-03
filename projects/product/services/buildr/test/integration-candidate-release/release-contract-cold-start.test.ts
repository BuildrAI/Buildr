import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
const workspaceRoot: any = path.resolve(serviceRoot, '../../../..');
const sourceCommit: any = 'a'.repeat(40);

test('release contract runs from a clean checkout before dependencies are installed', (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-contract-cold-start-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const cleanWorkspace: any = path.join(root, 'workspace');
  const cleanService: any = path.join(cleanWorkspace, 'projects/product/services/buildr');
  for (const relative of [
    'package.json',
    'tools/release/release-authority.ts',
    'tools/release/release-contract.ts',
    'tools/release/release-files.ts',
    'tools/release/release-notes.ts',
    'src/system/installation/domain/release-version.ts',
    'src/infrastructure/filesystem/filesystem-path-identity.ts',
  ]) {
    const target: any = path.join(cleanService, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(serviceRoot, relative), target);
  }
  fs.copyFileSync(path.join(workspaceRoot, 'CHANGELOG.md'), path.join(cleanWorkspace, 'CHANGELOG.md'));

  assert.equal(fs.existsSync(path.join(cleanService, 'node_modules')), false);
  const metadata: any = JSON.parse(fs.readFileSync(path.join(cleanService, 'package.json'), 'utf8'));
  const output: any = path.join(root, 'release-contract.json');
  const result: any = spawnSync(process.execPath, [
    path.join(cleanService, 'tools/release/release-contract.ts'),
    `v${metadata.version}`,
    '--source-commit', sourceCommit,
    '--output', output,
  ], {
    cwd: cleanWorkspace,
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: '' },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const contract: any = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(contract.version, metadata.version);
  assert.equal(contract.sourceCommit, sourceCommit);
});
