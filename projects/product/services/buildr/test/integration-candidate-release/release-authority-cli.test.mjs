import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = `jobs:
  publish:
    environment: npm-production
    permissions:
      id-token: write
    steps:
      - run: node scripts/release/trusted-publish.mjs candidate.tgz --access public
`;

test('release authority preflight CLI writes ready evidence without control-plane mutation', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-authority-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(path.join(repo, 'projects', 'product', 'services', 'buildr'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'projects', 'product', 'services', 'buildr', 'package.json'), `${JSON.stringify({ name: '@buildr-ai/buildr', repository: { url: 'git+https://github.com/BuildrAI/Buildr.git' } })}\n`);
  fs.writeFileSync(path.join(repo, '.github', 'workflows', 'publish.yml'), workflow);
  for (const args of [['init', '-b', 'main'], ['config', 'user.name', 'Buildr Test'], ['config', 'user.email', 'buildr@example.com'], ['remote', 'add', 'origin', 'git@github.com:BuildrAI/Buildr.git'], ['add', '.'], ['commit', '-m', 'fixture']]) {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const sourceCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim();
  const fakeGh = path.join(root, 'fake-gh.mjs');
  const fakeNpm = path.join(root, 'fake-npm.mjs');
  fs.writeFileSync(fakeGh, `#!/usr/bin/env node\nconst a=process.argv.slice(2); process.stdout.write(a[0]==='repo'?JSON.stringify({nameWithOwner:'BuildrAI/Buildr'}):JSON.stringify({name:'npm-production'}));\n`, { mode: 0o755 });
  fs.writeFileSync(fakeNpm, `#!/usr/bin/env node\nconst a=process.argv.slice(2); process.stdout.write(a[0]==='--version'?'11.17.0\\n':JSON.stringify({id:'publisher',type:'github',repository:'BuildrAI/Buildr',file:'publish.yml',environment:'npm-production',permissions:['createPackage']}));\n`, { mode: 0o755 });
  const evidencePath = path.join(root, 'authority-evidence.json');
  const result = spawnSync(process.execPath, [
    path.join(serviceRoot, 'scripts', 'release', 'release-authority-preflight.mjs'),
    '--repo', repo,
    '--source-commit', sourceCommit,
    '--gh', fakeGh,
    '--npm', fakeNpm,
    '--output', evidencePath,
  ], { cwd: serviceRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.status, 'ready');
  assert.equal(evidence.sourceCommit, sourceCommit);
  assert.deepEqual(evidence.findings, []);
});
