import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { SourceControlObservations } from '../../src/modules/code/application/source-control-observations.ts';

// Separate process/file from the transport substitution matrix. Native events
// are traced and forwarded unchanged; no fixture notification can satisfy this.
test('native filesystem events reach the shared observation through real watchers', { timeout: 15_000 }, async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-native-observation-')));
  const observations = new SourceControlObservations({ waitMs: 250, batchMs: 35 });
  t.after(() => { observations.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '--initial-branch=main'); git('config', 'user.name', 'Native Fixture'); git('config', 'user.email', 'native@example.com'); git('config', 'commit.gpgSign', 'false');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'base\n'); git('add', '.'); git('commit', '-m', 'fixture');
  const application = createCodeApplication({ assetCatalog: () => ({ repositories: [{ id: 'repo', code: 'repo', name: 'Native', source: { type: 'workspace', path: root } }], services: [], projects: [] }),
    resolveSourceRoot: (_root, source) => source.path, readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null });
  let nativeEventSeen = false;
  const nativeWatch = fs.watch;
  t.mock.method(fs, 'watch', (...args: any[]) => {
    const callback = args.at(-1);
    args[args.length - 1] = (event: string, filename: string | Buffer | null) => {
      if (filename?.toString().startsWith('native-live-')) nativeEventSeen = true;
      callback(event, filename);
    };
    return Reflect.apply(nativeWatch, fs, args);
  });
  await observations.observe(root, application.sourceControl(root));
  let cursor = (await observations.watch(root)).cursor;
  const controller = new AbortController();
  const startedAt = Date.now(); let writes = 0;
  const write = () => fs.writeFileSync(path.join(root, 'native-live-' + writes++ + '.txt'), 'real event\n');
  const writer = setInterval(write, 100); write();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    while (!controller.signal.aborted) {
      const changed = await observations.watch(root, cursor, controller.signal); cursor = changed.cursor;
      if (nativeEventSeen && changed.repositoryIds.includes('repo')) {
        t.diagnostic(`native delivery ${Date.now() - startedAt} ms, ${writes} real writes, zero injected notifications`);
        return;
      }
    }
    assert.fail(`Native filesystem delivery unavailable within 10000 ms (${writes} writes, nativeEventSeen=${nativeEventSeen}).`);
  } finally { clearInterval(writer); clearTimeout(timer); controller.abort(); }
});
