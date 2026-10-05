import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { candidateBrowserWebRoot, runCandidateBrowser } from '../verification/release/browser-candidate.ts';

const sourceCommit = 'a'.repeat(40);
const candidate = { tarball: '/frozen/buildr.tgz', manifest: { sourceCommit, sha256: 'b'.repeat(64), applicationPayloadDigest: `sha256-${'c'.repeat(64)}` } };
const payload = (root: string) => ({ root, layout: 'installed', manifest: { sourceCommit, applicationPayloadDigest: candidate.manifest.applicationPayloadDigest } });

test('Candidate Browser rejects source and Web payload drift before starting the browser', () => {
  assert.throws(() => candidateBrowserWebRoot(candidate, payload('/package'), 'd'.repeat(40)), /exact source-bound/u);
  assert.throws(() => candidateBrowserWebRoot(candidate, { ...payload('/package'), manifest: { ...payload('/package').manifest, applicationPayloadDigest: 'other' } }, sourceCommit), /differs from the frozen artifact/u);
  assert.throws(() => candidateBrowserWebRoot(candidate, { ...payload('/package'), layout: 'frozen' }, sourceCommit), /differs from the frozen artifact/u);
});

test('Candidate Browser hosts only the unpacked artifact Web tree and cleans it after the core journey', async () => {
  const invocations: any[] = [];
  let temporaryRoot = '';
  const result = await runCandidateBrowser({
    candidate, sourceCommit,
    verifyPayload(root: string, options: any) {
      assert.deepEqual(options, { layout: 'installed' });
      temporaryRoot = path.dirname(root);
      return payload(root);
    },
    async execute(step: any, options: any) {
      invocations.push({ argv: step.command.argv, options });
      return { status: 'passed', exitCode: 0, stdout: step.name === 'archive-inventory' ? 'package/application-payload.json\npackage/payload/product/web-dist/index.html\n' : '', stderr: '' };
    },
  });
  assert.deepEqual(result.selectors, ['core']);
  assert.equal(invocations.length, 3, '只列举、解包和运行核心浏览器，不执行网页构建或第二次打包');
  assert.deepEqual(invocations[0].argv, ['tar', '-tzf', candidate.tarball]);
  assert.deepEqual(invocations[1].argv, ['tar', '-xzf', candidate.tarball, '-C', temporaryRoot]);
  assert.deepEqual(invocations[2].argv.slice(-2), ['--', 'core']);
  assert.match(invocations[2].argv[1], /run-isolated-workspace-smoke\.ts$/u);
  assert.equal(invocations[2].options.env.BUILDR_BROWSER_WEB_DIST_ROOT, path.join(temporaryRoot, 'package/payload/product/web-dist'));
  assert.equal(fs.existsSync(temporaryRoot), false);
});

test('Candidate Browser rejects an archive escape before extracting and keeps failed journey cleanup', async () => {
  let extractCalled = false;
  await assert.rejects(runCandidateBrowser({
    candidate, sourceCommit,
    async execute(step: any) {
      if (step.name !== 'archive-inventory') extractCalled = true;
      return { status: 'passed', exitCode: 0, stdout: 'package/../escape\n', stderr: '' };
    },
  }), /invalid package path/u);
  assert.equal(extractCalled, false);

  let temporaryRoot = '';
  await assert.rejects(runCandidateBrowser({
    candidate, sourceCommit,
    verifyPayload(root: string) { temporaryRoot = path.dirname(root); return payload(root); },
    async execute(step: any) {
      return { status: step.name === 'browser:core' ? 'failed' : 'passed', exitCode: step.name === 'browser:core' ? 1 : 0,
        stdout: step.name === 'archive-inventory' ? 'package/application-payload.json\n' : '', stderr: '' };
    },
  }), /browser:core failed/u);
  assert.equal(fs.existsSync(temporaryRoot), false);
});
