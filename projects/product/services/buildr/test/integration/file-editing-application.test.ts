import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test, { type TestContext } from 'node:test';
import crypto from 'node:crypto';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import type { EditorFileSelector, SaveEditorFileInput } from '../../src/modules/code/application/file-editing-application.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { CODE_HTTP_SCHEMAS, CODE_HTTP_VALIDATORS } from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
import { EDITABLE_FILE_BYTES, EDITABLE_FILE_JSON_BYTES } from '../../src/modules/code/infrastructure/editable-file.ts';
import { gitCheckoutReadId } from '../../src/infrastructure/git/checkout-read-identity.ts';
import { defaultTestContextPool } from '../context/node-test.ts';
import { WORKSPACE_FOUNDATION_CONTEXT_KEY } from '../context/profiles.ts';
import { createRuntime, runtimeProvide } from '../helpers/runtime-harness.ts';
import { CODE_APPLICATION } from '../../src/modules/code/module.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { applySkillRenderPlan, buildSkillRenderPlan } from '../../src/modules/agent-assets/infrastructure/runtime/skills/render-plan.ts';

function fixture(t: TestContext) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-file-editing-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'repository'); fs.mkdirSync(root);
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  git('init', '--initial-branch=main'); git('config', 'user.email', 'fixture@example.com'); git('config', 'user.name', 'Fixture');
  fs.mkdirSync(path.join(root, 'project')); fs.writeFileSync(path.join(root, 'project', 'README.md'), '# Original\r\n');
  git('add', '.'); git('commit', '-m', 'initial');
  let projectRoot = path.join(root, 'project'), projectSource: unknown = { type: 'workspace', path: 'project' };
  const generated = new Set<string>();
  const app = createCodeApplication({ assetCatalog: () => ({ repositories: [{ id: 'repo', code: 'repo', name: 'Repo', source: { type: 'git', path: root } }], services: [], projects: [] }), resolveSourceRoot: (_root, source) => source.path, readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null,
    projectDetail: () => ({ project: { id: 'project-id', code: 'product', source: projectSource }, sourceLocation: { path: projectRoot, identity: 'project-source' } }),
    builtinManagedFiles: candidate => candidate === root ? [...generated] : [],
  });
  const code = (relative = 'project/README.md'): EditorFileSelector => ({ kind: 'code', repositoryId: 'repo', checkoutId: gitCheckoutReadId(root), path: relative });
  const project = (): EditorFileSelector => ({ kind: 'project', projectCode: 'product', path: 'README.md' });
  const input = (selector: EditorFileSelector, content: string): SaveEditorFileInput => { const observed = app.editorFile(root, selector); return { selector, content, expectedFileId: observed.fileId, expectedSourceRevision: observed.sourceRevision, expectedRevision: observed.revision }; };
  return { temporary, root, git, app, code, project, input, generated, rebind: (nextRoot: string, source: unknown = projectSource) => { projectRoot = nextRoot; projectSource = source; } };
}
const errorCode = (code: string) => (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);

test('project and explorer identify the same complete source and save preserves BOM, mixed newlines and executable mode', t => {
  const f = fixture(t), file = path.join(f.root, 'project', 'README.md'), original = '\uFEFF# Original\r\none\ntwo\r\n';
  fs.writeFileSync(file, original); fs.chmodSync(file, 0o755);
  const project = f.app.editorFile(f.root, f.project()), code = f.app.editorFile(f.root, f.code());
  assert.equal(project.fileId, code.fileId); assert.equal(project.revision, code.revision); assert.notEqual(project.sourceRevision, code.sourceRevision);
  assert.equal(project.content, original); assert.equal(project.absolutePath, fs.realpathSync(file));
  const saved = f.app.saveFile(f.root, f.input(f.project(), original.replace('Original', 'Updated')));
  assert.equal(saved.fileId, project.fileId); assert.notEqual(saved.revision, project.revision); assert.equal(fs.statSync(file).mode & 0o777, 0o755);
  assert.deepEqual(fs.readFileSync(file), Buffer.from('\uFEFF# Updated\r\none\ntwo\r\n'));
  assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.editorFile.$id, code).valid, true);
  assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.saveFile.$id, saved).valid, true);
  assert.equal(f.app.editorFile(f.root, f.code()).content, saved.content);
});

test('nested project Markdown links share the explorer file identity, save complete content and preserve conflict checks', t => {
  const f = fixture(t);
  for (const relative of ['knowledge/docs/architecture/verification-framework.md', 'knowledge/docs/architecture/NOTES.MD']) {
    const file = path.join(f.root, 'project', relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, '# Linked document\n');
    const selector: EditorFileSelector = { kind: 'project', projectCode: 'product', path: relative };
    const project = f.app.editorFile(f.root, selector), explorer = f.app.editorFile(f.root, f.code('project/' + relative));
    assert.equal(project.fileId, explorer.fileId); assert.equal(project.revision, explorer.revision); assert.equal(project.kind, 'markdown');
    const saved = f.app.saveFile(f.root, f.input(selector, '# Updated linked document\n'));
    assert.equal(saved.fileId, project.fileId); assert.equal(saved.content, '# Updated linked document\n');
    assert.equal(fs.readFileSync(file, 'utf8'), saved.content); assert.equal(f.app.editorFile(f.root, f.code('project/' + relative)).content, saved.content);
    const stale = f.input(selector, '# Local pending edit\n'); fs.writeFileSync(file, '# External linked edit\n');
    assert.throws(() => f.app.saveFile(f.root, stale), (error: any) => error.code === 'file_revision_conflict' && error.details.current.content === '# External linked edit\n' && error.details.current.selector.path === relative);
    assert.equal(fs.readFileSync(file, 'utf8'), '# External linked edit\n');
  }
});

test('stale and ABA revisions retain the external file and return the latest complete snapshot', t => {
  const f = fixture(t), file = path.join(f.root, 'project', 'README.md'), request = f.input(f.code(), 'local edit\n');
  fs.writeFileSync(file, 'external edit\n');
  assert.throws(() => f.app.saveFile(f.root, request), (error: any) => error.code === 'file_revision_conflict' && error.status === 409 && error.details.current.content === 'external edit\n');
  assert.equal(fs.readFileSync(file, 'utf8'), 'external edit\n');
  fs.writeFileSync(file, '# Original\r\n');
  assert.throws(() => f.app.saveFile(f.root, request), errorCode('file_revision_conflict'));
  const merge = f.input(f.code(), 'merged\n'); fs.writeFileSync(file, 'second external\n');
  assert.throws(() => f.app.saveFile(f.root, merge), (error: any) => error.details.current.content === 'second external\n');
  assert.equal(fs.readdirSync(path.dirname(file)).some(name => name.includes('.buildr-edit-')), false);
});

test('the final recheck catches an external write during staging, and failed replacement cleans up without changing the file', t => {
  const f = fixture(t), file = path.join(f.root, 'project', 'README.md'), request = f.input(f.project(), 'local\n');
  const sync = fs.fsyncSync;
  fs.fsyncSync = descriptor => { sync(descriptor); fs.writeFileSync(file, 'external during staging\n'); };
  try { assert.throws(() => f.app.saveFile(f.root, request), errorCode('file_revision_conflict')); }
  finally { fs.fsyncSync = sync; }
  assert.equal(fs.readFileSync(file, 'utf8'), 'external during staging\n');
  const retry = f.input(f.project(), 'retry local\n'), rename = fs.renameSync;
  fs.renameSync = (source, destination) => { if (String(destination) === fs.realpathSync(file)) throw Object.assign(new Error('fixture permission failure'), { code: 'EACCES' }); return rename(source, destination); };
  try { assert.throws(() => f.app.saveFile(f.root, retry), errorCode('EACCES')); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(file, 'utf8'), 'external during staging\n');
  assert.equal(fs.readdirSync(path.dirname(file)).some(name => name.includes('.buildr-edit-')), false);
  assert.equal(f.app.saveFile(f.root, retry).content, 'retry local\n');
});

test('project source rebind and replacement of the source directory reject an old save without writing either source', t => {
  const f = fixture(t), request = f.input(f.project(), 'local\n'), nextRoot = path.join(f.temporary, 'attached');
  fs.mkdirSync(nextRoot); fs.writeFileSync(path.join(nextRoot, 'README.md'), 'attached\n'); f.rebind(nextRoot, { type: 'workspace', root: 'attached', path: nextRoot });
  assert.throws(() => f.app.saveFile(f.root, request), errorCode('file_source_changed'));
  assert.equal(fs.readFileSync(path.join(nextRoot, 'README.md'), 'utf8'), 'attached\n');
  const observed = f.input(f.project(), 'new local\n'); fs.renameSync(nextRoot, nextRoot + '-old'); fs.mkdirSync(nextRoot); fs.copyFileSync(path.join(nextRoot + '-old', 'README.md'), path.join(nextRoot, 'README.md'));
  assert.throws(() => f.app.saveFile(f.root, observed), errorCode('file_source_changed'));
});

test('the explicit selected worktree remains independent from the registered main directory', t => {
  const f = fixture(t), checkout = path.join(f.temporary, 'candidate'); f.git('worktree', 'add', '--detach', checkout, 'HEAD');
  const selector: EditorFileSelector = { ...f.code(), checkoutId: gitCheckoutReadId(checkout) };
  const main = f.app.editorFile(f.root, f.code()), candidate = f.app.editorFile(f.root, selector);
  assert.notEqual(main.fileId, candidate.fileId); assert.equal(candidate.rootPath, fs.realpathSync(checkout));
  f.app.saveFile(f.root, f.input(selector, 'candidate only\n'));
  assert.equal(fs.readFileSync(path.join(checkout, 'project', 'README.md'), 'utf8'), 'candidate only\n');
  assert.equal(fs.readFileSync(path.join(f.root, 'project', 'README.md'), 'utf8'), '# Original\r\n');
});

test('managed blocks are immutable while custom text remains editable, and damaged markers are locally read-only', t => {
  const f = fixture(t), file = path.join(f.root, 'project', 'README.md'), block = '<!-- buildr:required begin -->\r\nprotected\r\n<!-- buildr:required end -->';
  fs.writeFileSync(file, block + '\r\ncustom\r\n');
  const before = f.app.editorFile(f.root, f.project()); assert.equal(before.editable, true); assert.equal(before.protectedRanges.length, 1);
  assert.equal(before.content.slice(before.protectedRanges[0].from, before.protectedRanges[0].to), block);
  assert.throws(() => f.app.saveFile(f.root, f.input(f.project(), before.content.replace('protected', 'changed'))), errorCode('file_managed_block_changed'));
  const saved = f.app.saveFile(f.root, f.input(f.project(), before.content.replace('custom', 'user edit'))); assert.match(saved.content, /user edit/);
  assert.throws(() => f.app.saveFile(f.root, f.input(f.project(), 'remove blocks\n')), errorCode('file_managed_block_changed'));
  fs.writeFileSync(file, '<!-- buildr:required begins -->\ncustom\n');
  assert.equal(f.app.editorFile(f.root, f.project()).readonlyReasonCode, 'file_managed_block_invalid');
  assert.throws(() => f.app.saveFile(f.root, f.input(f.project(), 'custom only\n')), errorCode('file_read_only'));
  // Marker literals in source code are ordinary text, not managed Markdown boundaries.
  fs.writeFileSync(file, "const marker = '<!-- buildr:required begin -->';\n"); assert.equal(f.app.editorFile(f.root, f.project()).editable, true);
});

test('generated ownership, binary, invalid UTF-8, large files and hard links remain read-only', t => {
  const f = fixture(t), cases = [
    { name: 'generated.md', bytes: Buffer.from('---\nname: fixture\n---\n<!-- Generated by Buildr. Hash: x. Do not edit. -->\ntext\n'), code: 'file_generated' },
    { name: 'binary.bin', bytes: Buffer.from([1, 0, 2]), code: 'file_binary' },
    { name: 'invalid.txt', bytes: Buffer.from([0xff, 0xfe]), code: 'file_encoding_unsupported' },
    { name: 'large.txt', bytes: Buffer.alloc(EDITABLE_FILE_BYTES + 1, 120), code: 'file_too_large' },
  ];
  for (const item of cases) {
    fs.writeFileSync(path.join(f.root, item.name), item.bytes); const selector = f.code(item.name), observed = f.app.editorFile(f.root, selector);
    assert.equal(observed.editable, false); assert.equal(observed.readonlyReasonCode, item.code);
    assert.throws(() => f.app.saveFile(f.root, f.input(selector, 'changed')), errorCode('file_read_only'));
    assert.deepEqual(fs.readFileSync(path.join(f.root, item.name)), item.bytes);
  }
  fs.writeFileSync(path.join(f.root, 'owned.md'), 'delivered without marker\n'); f.generated.add('owned.md');
  assert.equal(f.app.editorFile(f.root, f.code('owned.md')).readonlyReasonCode, 'file_generated');
  fs.linkSync(path.join(f.root, 'owned.md'), path.join(f.root, 'linked.md'));
  assert.equal(f.app.editorFile(f.root, f.code('linked.md')).readonlyReasonCode, 'file_hard_link');
  fs.writeFileSync(path.join(f.root, 'readonly.txt'), 'read only\n'); fs.chmodSync(path.join(f.root, 'readonly.txt'), 0o444);
  assert.equal(f.app.editorFile(f.root, f.code('readonly.txt')).readonlyReasonCode, 'file_not_writable');
  assert.throws(() => f.app.saveFile(f.root, f.input(f.code('readonly.txt'), 'replace through writable parent\n')), errorCode('file_read_only'));
});

test('empty and exactly five-MiB UTF-8 files save completely and oversized or malformed new content is rejected', t => {
  const f = fixture(t), file = path.join(f.root, 'project', 'README.md'); fs.writeFileSync(file, '');
  const exact = 'x'.repeat(EDITABLE_FILE_BYTES), saved = f.app.saveFile(f.root, f.input(f.project(), exact));
  assert.equal(saved.content, exact); assert.equal(saved.sizeBytes, EDITABLE_FILE_BYTES);
  assert.throws(() => f.app.saveFile(f.root, f.input(f.project(), exact + 'x')), errorCode('file_too_large'));
  assert.throws(() => f.app.saveFile(f.root, f.input(f.project(), '\ud800')), errorCode('file_content_invalid'));
  assert.throws(() => f.app.saveFile(f.root, f.input(f.project(), 'x\0')), errorCode('file_content_invalid'));
});

test('traversal, symlink segments, Git metadata and history-shaped selectors cannot write', t => {
  const f = fixture(t); fs.symlinkSync(path.join(f.root, 'project', 'README.md'), path.join(f.root, 'inside.md')); fs.symlinkSync(path.join(f.root, 'project'), path.join(f.root, 'alias'));
  fs.writeFileSync(path.join(f.temporary, 'outside.md'), 'outside'); fs.symlinkSync(path.join(f.temporary, 'outside.md'), path.join(f.root, 'outside.md'));
  for (const relative of ['../outside.md', '/etc/hosts', '.git/config', 'outside.md']) assert.throws(() => f.app.editorFile(f.root, f.code(relative)));
  for (const relative of ['inside.md', 'alias/README.md']) assert.throws(() => f.app.editorFile(f.root, f.code(relative)), errorCode('file_path_forbidden'));
  assert.throws(() => f.app.editorFile(f.root, { kind: 'project', projectCode: 'product', path: 'nested.txt' }), errorCode('file_project_document_forbidden'));
  for (const relative of ['../outside.md', 'knowledge/../README.md', '.git/config.md']) assert.throws(() => f.app.editorFile(f.root, { kind: 'project', projectCode: 'product', path: relative }), errorCode('code_path_forbidden'));
  fs.symlinkSync(path.join(f.root, 'project', 'README.md'), path.join(f.root, 'project', 'internal.md'));
  fs.symlinkSync(path.join(f.root, 'project'), path.join(f.root, 'project', 'directory-alias'));
  fs.symlinkSync(path.join(f.temporary, 'outside.md'), path.join(f.root, 'project', 'external.md'));
  for (const relative of ['internal.md', 'directory-alias/README.md', 'external.md']) assert.throws(() => f.app.editorFile(f.root, { kind: 'project', projectCode: 'product', path: relative }), errorCode('file_path_forbidden'));
  const request = f.input(f.code(), 'changed'), http = createCodeHttpContribution(f.app);
  return assert.rejects(http.handle({ request: { method: 'POST' }, suffix: '/code/save-file', searchParams: new URLSearchParams(), root: f.root, authorizeWrite: () => {}, readJsonBody: async () => ({ ...request, selector: { ...request.selector, commitHash: f.git('rev-parse', 'HEAD') } }) }), errorCode('file_save_input_invalid'));
});

test('HTTP validates both selectors, applies session authorization before parsing, expands only save JSON and routes reads through the worker', async t => {
  const f = fixture(t), http = createCodeHttpContribution(f.app), query = new URLSearchParams({ kind: 'project', projectCode: 'product', filePath: 'README.md' });
  let routed = false, parsed = false, limit: number | undefined;
  const response = await http.handle({ request: { method: 'GET' }, suffix: '/code/editor-file', searchParams: query, root: f.root, submitTaskRead: async (operation, _id, input) => { assert.equal(operation, 'code-editor-file'); routed = true; return f.app.editorFile(f.root, JSON.parse(input.input)); } });
  assert.equal(response?.status, 200); assert.equal(routed, true);
  const request = { request: { method: 'POST' }, suffix: '/code/save-file', searchParams: new URLSearchParams(), root: f.root, readJsonBody: async (maxBytes?: number) => { parsed = true; limit = maxBytes; return f.input(f.project(), 'saved\n'); } };
  await assert.rejects(http.handle(request), errorCode('file_write_unauthorized')); assert.equal(parsed, false);
  await assert.rejects(http.handle({ ...request, authorizeWrite: () => { throw Object.assign(new Error('unauthorized'), { code: 'session_test' }); } }), errorCode('session_test')); assert.equal(parsed, false);
  const saved = await http.handle({ ...request, authorizeWrite: () => {} }); assert.equal(saved?.body.content, 'saved\n'); assert.equal(limit, EDITABLE_FILE_JSON_BYTES);
  for (const values of [{ kind: 'code', repositoryId: 'repo', filePath: 'README.md' }, { kind: 'project', projectCode: 'product', repositoryId: 'repo', filePath: 'README.md' }]) await assert.rejects(http.handle({ request: { method: 'GET' }, suffix: '/code/editor-file', searchParams: new URLSearchParams(values), root: f.root }), errorCode('file_query_invalid'));
});

test('real HTTP reads through the bounded worker, saves escaped large UTF-8, reports conflicts and preserves project images', { timeout: 30_000 }, async t => {
  const lease = defaultTestContextPool().acquire(WORKSPACE_FOUNDATION_CONTEXT_KEY, { name: 'file-editing-http' });
  const root = fs.realpathSync(lease.root), base = fs.realpathSync(lease.base);
  const previous = { app: process.env.BUILDR_APP_DATA_DIR, product: process.env.BUILDR_PRODUCT_DATA_DIR };
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data'); process.env.BUILDR_PRODUCT_DATA_DIR = path.join(base, 'product-data');
  const runtime = createRuntime();
  let instance: ReturnType<typeof createLocalWorkspaceServer> | undefined;
  t.after(async () => {
    try { if (instance) await new Promise<void>(resolve => instance!.server.close(() => resolve())); }
    finally {
      lease.release();
      if (previous.app === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previous.app;
      if (previous.product === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR; else process.env.BUILDR_PRODUCT_DATA_DIR = previous.product;
    }
  });
  runtime.createProjectAsset({ targetRoot: root, project: 'editor', repoRef: null, attachRef: null, name: 'Editor', description: 'File editing fixture', remote: 'origin', remoteExplicit: false, integrationBranch: null });
  const file = path.join(root, 'projects', 'editor', 'README.md'), image = path.join(path.dirname(file), 'cover.png');
  fs.writeFileSync(file, '# Original\n![cover](cover.png)\n'); fs.writeFileSync(image, Buffer.from('89504e470d0a1a0a', 'hex'));
  execFileSync('git', ['-C', root, 'init', '--initial-branch=main'], { stdio: 'ignore' });
  const workspaceId = runtime.getWorkspace(root).workspace.id, repositoryId = crypto.randomUUID();
  fs.writeFileSync(path.join(root, 'repositories', 'manifest.yml'), JSON.stringify({ schemaVersion: 'buildr.repositories/v1', repositories: { fixture: { id: repositoryId, workspaceId, code: 'fixture', name: 'Fixture', description: '', source: { type: 'git', path: '.' } } } }));
  const code = runtimeProvide(runtime, CODE_APPLICATION);
  instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  const { url, initialWorkspaceId, sessionToken } = await instance.ready, endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}`;
  const json = async (response: Response, status = 200) => { const body = await response.json() as any; assert.equal(response.status, status, JSON.stringify(body)); return body; };
  const query = new URLSearchParams({ kind: 'project', projectCode: 'editor', filePath: 'README.md' });
  let observed = await json(await fetch(endpoint + '/code/editor-file?' + query));
  assert.equal(observed.content, '# Original\n![cover](cover.png)\n'); assert.ok(observed.imageContext);
  const fetchImage = (context: { documentDigest: string; sourceIdentity: string }) => fetch(endpoint + '/projects/editor/document-image?' + new URLSearchParams({ expectedDocumentDigest: context.documentDigest, expectedSourceIdentity: context.sourceIdentity, documentPath: 'README.md', href: 'cover.png' }));
  assert.equal((await fetchImage(observed.imageContext)).status, 200);
  const body = (content: string) => ({ selector: observed.selector, expectedFileId: observed.fileId, expectedSourceRevision: observed.sourceRevision, expectedRevision: observed.revision, content });
  const save = (input: unknown, token = sessionToken) => fetch(endpoint + '/code/save-file', { method: 'POST', headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': token }, body: JSON.stringify(input) });
  await json(await save(body('denied'), 'wrong'), 403); assert.match(fs.readFileSync(file, 'utf8'), /Original/);
  observed = await json(await save(body('# Saved\n![cover](cover.png)\n'))); assert.ok(observed.imageContext); assert.equal((await fetchImage(observed.imageContext)).status, 200);
  const explorer = await json(await fetch(endpoint + '/code/editor-file?' + new URLSearchParams({ kind: 'code', repositoryId, checkoutId: gitCheckoutReadId(root), filePath: 'projects/editor/README.md' })));
  assert.equal(explorer.fileId, observed.fileId); assert.equal(explorer.content, observed.content);
  fs.writeFileSync(file, 'external\n'); const conflict = await json(await save(body('local\n')), 409); assert.equal(conflict.error.code, 'file_revision_conflict'); assert.equal(conflict.error.details.current.content, 'external\n');
  observed = conflict.error.details.current;
  // Control characters expand sixfold in JSON; the actual file remains within five MiB.
  const escaped = '\u0001'.repeat(64 * 1024) + '\n'; observed = await json(await save(body(escaped))); assert.equal(observed.content, escaped); assert.equal(fs.readFileSync(file, 'utf8'), escaped);
  const receipts = JSON.parse(fs.readFileSync(path.join(root, '.buildr', 'builtin-receipts.json'), 'utf8'));
  const skill = receipts.builtins.find((item: { type: string }) => item.type === 'skill');
  if (skill) assert.equal(code.editorFile(root, { kind: 'code', repositoryId, checkoutId: gitCheckoutReadId(root), path: path.posix.join(skill.target, skill.files[0].path) }).readonlyReasonCode, 'file_generated');
  const sourceDir = path.join(root, 'source-fixture'); fs.mkdirSync(path.join(sourceDir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '---\nname: editor-fixture\ndescription: Editor fixture\n---\n');
  fs.writeFileSync(path.join(sourceDir, 'references', 'guide.md'), '# A projected reference without a generated header\n');
  applySkillRenderPlan(buildSkillRenderPlan(root, root, [{ id: 'editor-fixture', sourceDir, sourceFile: path.join(sourceDir, 'SKILL.md'), origin: 'workspace', runtimePath: 'editor-fixture', declaredScope: '.' }], 'codex'), root);
  assert.equal(code.editorFile(root, { kind: 'code', repositoryId, checkoutId: gitCheckoutReadId(root), path: '.agents/skills/editor-fixture/references/guide.md' }).readonlyReasonCode, 'file_generated');
  fs.mkdirSync(path.join(root, '.agents', 'skills', 'manual'), { recursive: true }); fs.writeFileSync(path.join(root, '.agents', 'skills', 'manual', 'notes.md'), 'user owned\n');
  assert.equal(code.editorFile(root, { kind: 'code', repositoryId, checkoutId: gitCheckoutReadId(root), path: '.agents/skills/manual/notes.md' }).editable, true);
  const nestedRelative = 'knowledge/docs/architecture/verification-framework.MD', nestedFile = path.join(root, 'projects', 'editor', nestedRelative);
  fs.mkdirSync(path.dirname(nestedFile), { recursive: true }); fs.writeFileSync(nestedFile, '# Nested HTTP source\n');
  const nested = await json(await fetch(endpoint + '/code/editor-file?' + new URLSearchParams({ kind: 'project', projectCode: 'editor', filePath: nestedRelative })));
  const nestedCode = await json(await fetch(endpoint + '/code/editor-file?' + new URLSearchParams({ kind: 'code', repositoryId, checkoutId: gitCheckoutReadId(root), filePath: 'projects/editor/' + nestedRelative })));
  assert.equal(nested.fileId, nestedCode.fileId); assert.equal(nested.content, '# Nested HTTP source\n');
  const nestedInput = { selector: nested.selector, expectedFileId: nested.fileId, expectedSourceRevision: nested.sourceRevision, expectedRevision: nested.revision, content: '# Nested HTTP saved\n' };
  const nestedSaved = await json(await save(nestedInput)); assert.equal(fs.readFileSync(nestedFile, 'utf8'), nestedSaved.content); assert.equal(nestedSaved.content, '# Nested HTTP saved\n');
  fs.writeFileSync(nestedFile, '# Nested external edit\n');
  const nestedConflict = await json(await save({ ...nestedInput, expectedRevision: nestedSaved.revision, content: '# Nested local edit\n' }), 409);
  assert.equal(nestedConflict.error.code, 'file_revision_conflict'); assert.equal(nestedConflict.error.details.current.content, '# Nested external edit\n');
  assert.equal(fs.readFileSync(nestedFile, 'utf8'), '# Nested external edit\n');
});
