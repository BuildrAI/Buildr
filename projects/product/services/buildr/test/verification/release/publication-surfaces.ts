import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchTestBrowser } from '../../browser-smoke/browser-launch.ts';
import { publicationTestPng } from '../../browser-smoke/publication-journey.ts';
import { waitForWebReadiness } from './release-smoke.ts';
import { stopOwnedChildProcess } from '../support/owned-process.ts';
import { buildGeneratedArtifactSet } from '../../../tools/build/artifact-set.ts';
import { buildApplicationPayload } from '../../../../../../../skills/buildr-release/scripts/application-payload.ts';
import { createReleaseArtifact } from '../../../../../../../skills/buildr-release/scripts/release-artifact.ts';

// A focused installed-package check, not a full release certification. The
// isolated workspace runner owns generated packages, installation and user state.
const root = process.env.BUILDR_SMOKE_ROOT;
assert.ok(root, 'Use run-isolated-workspace-smoke.ts to isolate user state.');
const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const prefix = path.join(root, 'installation');
const installationEnv = { ...process.env };
delete installationEnv.BUILDR_LOCAL_APP_PREVIEW;

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command} ${args[0]}: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
}

let tarball: string;
if (process.argv.includes('--tarball')) {
  tarball = path.resolve(process.argv[process.argv.indexOf('--tarball') + 1]);
  assert.ok(fs.statSync(tarball).isFile(), '--tarball must name a local candidate package.');
} else {
  process.stderr.write('[publication-surfaces] building local candidate using production package builders\n');
  const sourceCommit = run('git', ['rev-parse', 'HEAD'], serviceRoot, installationEnv).trim();
  const generated = await buildGeneratedArtifactSet(path.join(root, 'generated'), { sourceIdentity: sourceCommit });
  const payload = await buildApplicationPayload(path.join(root, 'payload'), sourceCommit, { generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot });
  const artifact = createReleaseArtifact(payload.root, path.join(root, 'package'), { testContextRoot: generated.testContextRoot });
  tarball = artifact.tarball;
}
process.stderr.write('[publication-surfaces] installing local candidate in isolated prefix\n');
run(npm, ['install', '--offline', '--global', '--prefix', prefix, path.resolve(tarball)], root, installationEnv);
const modulesRoot = run(npm, ['root', '--global', '--prefix', prefix], root, installationEnv).trim();
const installedEntry = path.join(modulesRoot, '@buildr-ai/buildr/bin/buildr.mjs');
const browser = await launchTestBrowser();
const results: unknown[] = [];
try {
  for (const [surface, entry, channel, webProfile] of [
    ['development', path.join(serviceRoot, 'bin/buildr.mjs'), 'development', 'development'],
    ['installed', installedEntry, 'npm', 'released'],
  ]) {
    process.stderr.write(`[publication-surfaces] checking ${surface} ordinary Web entry\n`);
    const directory = path.join(root, surface), workspace = path.join(directory, 'workspace');
    const appData = path.join(directory, 'app-data');
    const env = { ...installationEnv, BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: path.join(directory, 'product-data'), BUILDR_LOCAL_APP_NO_OPEN: '1' };
    fs.mkdirSync(workspace, { recursive: true });
    const cli = (args: string[], json = false) => {
      const output = run(process.execPath, [entry, ...args, '--target', workspace, ...(json ? ['--json'] : [])], workspace, env);
      return json ? JSON.parse(output) : output;
    };
    cli(['init', '--name', `articles-${surface}`, '--profile', 'team']);
    cli(['project', 'create', 'article-check', '--name', '文章检查']);
    const relative = 'projects/article-check/docs/publications/article.md';
    const content = '---\nid: article\ntitle: 跨入口文章验证\nstatus: published\n---\n\n## 检查章节\n\n主目录正文\n\n![来源图片](assets/chart.png)\n';
    fs.mkdirSync(path.join(workspace, path.dirname(relative), 'assets'), { recursive: true });
    fs.writeFileSync(path.join(workspace, relative), content);
    fs.writeFileSync(path.join(workspace, path.dirname(relative), 'assets/chart.png'), publicationTestPng);
    const git = (args: string[]) => run('git', args, workspace, env);
    git(['init', '-q']); git(['config', 'user.name', 'Article Fixture']); git(['config', 'user.email', 'fixture@example.com']);
    git(['add', '.']); git(['commit', '-qm', 'article fixture baseline']);
    for (const id of ['draft-a', 'draft-b']) {
      const created = cli(['task', 'create', id, '--title', `来源任务 ${id}`, '--intent', '验证工作树稿件', '--status', 'active', '--project', 'article-check'], true);
      const prepared = cli(['worktree', 'create', id, '--branch', `codex/${id}`, '--start-point', 'HEAD', '--include', 'workspace'], true);
      assert.equal(prepared.status, 'ready', JSON.stringify(prepared.diagnostic));
      const checkout = prepared.repositories.find((item: any) => item.selector === 'workspace').checkoutPath;
      fs.writeFileSync(path.join(checkout, relative), content.replace('主目录正文', `${id} 的独立正文`));
      // Valid PNGs with distinguishable trailing bytes prove source fidelity.
      fs.writeFileSync(path.join(checkout, path.dirname(relative), 'assets/chart.png'), Buffer.concat([publicationTestPng, Buffer.from(id)]));
      if (id === 'draft-a') cli(['task', 'complete', id, '--summary', '保留工作树草稿', '--expected-record', created.recordDigest]);
    }
    let stderr = '';
    const child = spawn(process.execPath, [entry, 'web', '--target', workspace, '--no-open', '--port', '0'], { cwd: workspace, env, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr!.setEncoding('utf8'); child.stderr!.on('data', chunk => { stderr += chunk; });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const health = await waitForWebReadiness({ appData, child, stderr: () => stderr });
      assert.equal(health.productIdentity.channel, channel);
      assert.equal(health.webProfile.profile, webProfile);
      assert.equal(health.previewIdentity, null, 'Ordinary Web must not depend on preview mode.');
      const get = async (url: string) => {
        const response = await fetch(`${health.url}${url}`);
        assert.equal(response.status, 200, url);
        return response;
      };
      const registry = await (await get('/api/v1/workspaces')).json() as any;
      assert.equal(registry.workspaces.length, 1, 'No real user workspace registry may leak into the fixture.');
      const workspaceId = registry.workspaces[0].workspace.id;
      const api = `/api/v1/workspaces/${workspaceId}`;
      const list = await (await get(`${api}/publications`)).json() as any;
      assert.equal(list.publications.length, 3);
      assert.deepEqual(new Set(list.publications.filter((item: any) => item.sourceTask).map((item: any) => item.sourceTask.id)), new Set(['draft-a', 'draft-b']));
      const page = await context.newPage();
      for (const id of ['draft-a', 'draft-b']) {
        const resource = `${api}/tasks/${id}/projects/article-check/publications/article`;
        const detail = await (await get(resource)).json() as any;
        assert.ok(detail.content.includes(`${id} 的独立正文`));
        assert.equal(detail.publication.sourceTask.id, id);
        assert.equal(detail.publication.status, 'draft');
        const asset = await get(`${resource}/assets/${encodeURIComponent('assets/chart.png')}`);
        assert.match(asset.headers.get('content-type') || '', /image\/png/);
        assert.deepEqual(Buffer.from(await asset.arrayBuffer()), Buffer.concat([publicationTestPng, Buffer.from(id)]));
        await page.goto(`${health.url}/workspaces/${workspaceId}/articles/article-check/article?task=${id}`);
        const reader = page.locator('.publication-reader:visible');
        await reader.getByText(`${id} 的独立正文`, { exact: true }).waitFor({ state: 'visible' });
        await reader.getByRole('heading', { name: '检查章节', exact: true }).waitFor({ state: 'visible' });
        await reader.getByRole('link', { name: `来源任务：来源任务 ${id}`, exact: true }).waitFor({ state: 'visible' });
        await reader.getByRole('img', { name: '来源图片', exact: true }).evaluate(image => (image as HTMLImageElement).decode());
      }
      await page.goto(`${health.url}/workspaces/${workspaceId}/articles/article-check/article?task=draft-a`);
      await page.locator('.publication-reader:visible .publication-modebar .ant-segmented-item').filter({ hasText: '编辑' }).click();
      const editor = page.locator('#article-editor');
      await editor.locator('#article-edit-content').waitFor({ state: 'visible' });
      await editor.locator('#article-edit-content').fill('## 检查章节\n\n用户校准后的正文\n\n![来源图片](assets/chart.png)\n');
      await page.locator('#article-save').click();
      await editor.waitFor({ state: 'hidden' });
      await page.locator('.publication-reader:visible').getByText('用户校准后的正文', { exact: true }).waitFor({ state: 'visible' });
      await page.locator('.publication-reader:visible').getByText('原文', { exact: true }).click();
      const sourceInput = page.locator('#article-source-content');
      await sourceInput.waitFor({ state: 'visible' });
      await sourceInput.fill((await sourceInput.inputValue()).replace('用户校准后的正文', '用户直接在原文校准后的正文'));
      await page.locator('#article-source-save').click();
      await page.locator('.publication-reader:visible').getByText('用户直接在原文校准后的正文', { exact: true }).waitFor({ state: 'visible' });
      const saved = await (await get(`${api}/tasks/draft-a/projects/article-check/publications/article`)).json() as any;
      const untouched = await (await get(`${api}/tasks/draft-b/projects/article-check/publications/article`)).json() as any;
      assert.ok(saved.content.includes('用户直接在原文校准后的正文'));
      assert.ok(untouched.content.includes('draft-b 的独立正文'));
      assert.equal(fs.readFileSync(path.join(workspace, relative), 'utf8'), content);
      results.push({ surface, channel, webProfile, previewMode: false, worktreeDrafts: 2, bodyAndImages: 'passed', editing: 'passed', browser: 'passed' });
    } finally {
      await context.close();
      await stopOwnedChildProcess(child);
    }
  }
} finally { await browser.close(); }
process.stdout.write(`${JSON.stringify({ status: 'passed', scope: 'publication-entry-parity', results })}\n`);
