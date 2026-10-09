import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createReleaseCandidatePlan } from '../../tools/release/verify-pr-candidate.ts';

test('complete main-to-frozen Git diff catches main changes already present in the dev baseline', () => {
  const sdkPatches = path.resolve(import.meta.dirname, '../../../dsh-plugin/sdk-patches');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-scope-git-'));
  const git = (args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (name: string, content: string) => { const file = path.join(directory, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
  const commit = () => { git(['add', '.']); git(['-c', 'user.name=Scope Test', '-c', 'user.email=scope@example.invalid', 'commit', '-qm', 'fixture']); return git(['rev-parse', 'HEAD']).trim(); };
  try {
    git(['init', '--template=', '-q']);
    write('.github/workflows/verify.yml', 'name: Verify\n');
    write('projects/product/services/buildr/package.json', '{"version":"0.1.0-rc.38"}\n');
    write('projects/product/services/buildr/src/runtime.ts', 'export const value = 1;\n');
    write('projects/product/services/dsh-plugin/package.json', '{"version":"0.1.0-rc.1"}\n');
    write('projects/product/services/dsh-plugin/plugin/entry.ts', 'export const value = 1;\n');
    for (const name of ['dsh-v0.2.0-rc.2-event-sources-settings.json', 'dsh-v0.2.0-rc.2-event-sources-settings.patch']) write(`projects/product/services/dsh-plugin/sdk-patches/${name}`, fs.readFileSync(path.join(sdkPatches, name), 'utf8'));
    const main = commit();
    git(['update-ref', 'refs/remotes/origin/main', main]);
    write('projects/product/services/buildr/src/runtime.ts', 'export const value = 2;\n');
    const baseline = commit();
    write('projects/product/services/dsh-plugin/plugin/entry.ts', 'export const value = 2;\n');
    const frozen = commit();
    assert.equal(git(['diff', '--name-only', baseline, frozen]).includes('buildr/src'), false);
    const env = { BUILDR_RELEASE_PACKAGES: 'dsh-plugin', BUILDR_PLUGIN_VERSION: '0.1.0-rc.1', BUILDR_SELECTION_ID: 'dsh-plugin-0.1.0-rc.1', BUILDR_SELECTION_BASELINE: baseline, BUILDR_SELECTION_MAIN: main, BUILDR_SELECTION_IDENTITY: 'a'.repeat(64), BUILDR_BUILDR_PEER_VERSION: '0.1.0-rc.38', BUILDR_BUILDR_PEER_INTEGRITY: `sha512-${Buffer.alloc(64).toString('base64')}`, CANDIDATE_SOURCE_SHA: frozen };
    const plan = createReleaseCandidatePlan(env, git);
    assert.equal(plan.requirements.buildr, true);
    assert.equal(plan.requirements.plugin, true);
    assert.ok(plan.changedPaths.includes('projects/product/services/buildr/src/runtime.ts'));
    git(['update-ref', 'refs/remotes/origin/main', baseline]);
    assert.throws(() => createReleaseCandidatePlan(env, git), /Observed main differs/u);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
