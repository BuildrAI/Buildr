import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyPreviewReuse,
  parsePreviewReuseSelection,
  previewReuseError,
  readPreviewReuseFacts,
  resolvePreviewReuseSource,
  type PreviewReuseFacet,
} from '../../src/web/application/preview-reuse.ts';
import { createModelCatalogFacet } from '../../src/web/application/preview-reuse-model-catalog.ts';

function fakeFacet(id: string, input: { defaultFor?: boolean; requires?: string[]; apply?: PreviewReuseFacet['apply'] } = {}): PreviewReuseFacet {
  return {
    id,
    label: id,
    sensitivity: 'metadata',
    defaultFor: input.defaultFor ?? false,
    ownership: ['agent-service'],
    requires: input.requires,
    apply: input.apply ?? (async (apply) => ({ status: 'seeded', files: 1, bytes: 2, diagnostics: [], changedAt: apply.now() })),
  };
}

function coded(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

test('facet 选择按依赖排序、去重并拒绝未知来源或 facet', () => {
  const registry = [fakeFacet('agent-runtime', { defaultFor: true, requires: ['model-catalog'] }), fakeFacet('model-catalog', { defaultFor: true })];
  assert.deepEqual(parsePreviewReuseSelection('development', registry), {
    source: 'development',
    requestedFacets: ['agent-runtime', 'model-catalog'],
    facets: ['model-catalog', 'agent-runtime'],
  });
  assert.deepEqual(parsePreviewReuseSelection('development:agent-runtime', registry).facets, ['model-catalog', 'agent-runtime']);
  assert.deepEqual(parsePreviewReuseSelection('development:model-catalog,model-catalog', registry).facets, ['model-catalog']);
  assert.throws(() => parsePreviewReuseSelection('released', registry), (error) => coded(error, 'preview_reuse_invalid'));
  assert.throws(() => parsePreviewReuseSelection('development:unknown', registry), (error) => coded(error, 'preview_reuse_invalid'));
  assert.throws(() => parsePreviewReuseSelection('development:', registry), (error) => coded(error, 'preview_reuse_invalid'));
  assert.throws(() => parsePreviewReuseSelection('development', [fakeFacet('a', { requires: ['missing'] })]), (error) => coded(error, 'preview_reuse_registry_invalid'));
});

test('来源解析拒绝缺失与不可读路径，并遵循平台数据根环境', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-reuse-source-'));
  t.after(() => { try { fs.chmodSync(path.join(home, 'Library', 'Application Support', 'Buildr Dev'), 0o700); } catch {} fs.rmSync(home, { recursive: true, force: true }); });
  assert.throws(() => resolvePreviewReuseSource('development', { platform: 'darwin', home, env: {} }), (error) => coded(error, 'preview_reuse_source_unavailable'));
  const development = path.join(home, 'Library', 'Application Support', 'Buildr Dev');
  fs.mkdirSync(development, { recursive: true });
  assert.equal(resolvePreviewReuseSource('development', { platform: 'darwin', home, env: {} }).root, development);
  fs.chmodSync(development, 0o000);
  assert.throws(() => resolvePreviewReuseSource('development', { platform: 'darwin', home, env: {} }), (error) => coded(error, 'preview_reuse_source_unavailable'));
  fs.chmodSync(development, 0o700);

  const state = path.join(home, 'state');
  fs.mkdirSync(path.join(state, 'buildr-dev'), { recursive: true });
  assert.equal(resolvePreviewReuseSource('development', { platform: 'linux', home, env: { XDG_STATE_HOME: state } }).root, path.join(state, 'buildr-dev'));
});

test('facet 失败被隔离，结果与时间可观察且不泄露异常路径', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-reuse-apply-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls: string[] = [];
  const registry = [
    fakeFacet('first', { apply: async (input) => { calls.push('first'); return { status: 'seeded', files: 1, bytes: 10, diagnostics: [], changedAt: input.now() }; } }),
    fakeFacet('broken', { apply: async () => { throw new Error(`${root}/secret/path`); } }),
    fakeFacet('last', { requires: ['first'], apply: async (input) => { calls.push('last'); return { status: 'refreshed', files: 2, bytes: 20, diagnostics: [], changedAt: input.now() }; } }),
  ];
  const selection = { source: 'development' as const, requestedFacets: ['last', 'broken'], facets: ['first', 'broken', 'last'] };
  const facts = await applyPreviewReuse({
    selection,
    sourceRoot: path.join(root, 'source'),
    previewRoot: path.join(root, 'preview'),
    registry,
    now: () => new Date('2026-10-27T00:00:00.000Z'),
  });
  assert.deepEqual(calls, ['first', 'last']);
  assert.deepEqual(facts.results.map((result) => [result.id, result.status]), [['first', 'seeded'], ['broken', 'failed'], ['last', 'refreshed']]);
  assert.equal(facts.seededAt, '2026-10-27T00:00:00.000Z');
  assert.equal(facts.refreshedAt, '2026-10-27T00:00:00.000Z');
  assert.equal(facts.appliedAt, '2026-10-27T00:00:00.000Z');
  const diagnostics = facts.results.flatMap((result) => result.diagnostics);
  assert.ok(diagnostics.every((entry) => !entry.includes(root)));
  assert.deepEqual(readPreviewReuseFacts(JSON.parse(JSON.stringify(facts))), facts);
  assert.equal(readPreviewReuseFacts({ ...facts, schemaVersion: 'other' }), null);
});

test('model-catalog 首次播种、复用、刷新与失败保留旧副本', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-reuse-catalog-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, 'source');
  const previewRoot = path.join(root, 'preview');
  const source = path.join(sourceRoot, 'agent-service', 'model-access');
  fs.mkdirSync(path.join(source, 'accounts'), { recursive: true });
  fs.writeFileSync(path.join(source, 'accounts.json'), '{"version":1,"preferences":{"executionModel":"m"},"accounts":[]}\n');
  fs.writeFileSync(path.join(source, 'accounts', 'one.json'), '{"id":"one"}\n');
  const registry = [createModelCatalogFacet()];
  const selection = parsePreviewReuseSelection('development:model-catalog', registry);
  const target = path.join(previewRoot, 'agent-service', 'model-access');

  const seeded = await applyPreviewReuse({ selection, sourceRoot, previewRoot, registry, now: () => new Date('2026-10-27T01:00:00.000Z') });
  assert.equal(seeded.results[0].status, 'seeded');
  assert.equal(fs.readFileSync(path.join(target, 'accounts.json'), 'utf8'), fs.readFileSync(path.join(source, 'accounts.json'), 'utf8'));
  assert.equal(fs.statSync(path.join(previewRoot, 'agent-service')).mode & 0o777, 0o700);
  assert.equal(fs.statSync(target).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(target, 'accounts.json')).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(path.join(source, 'accounts.json'), 'utf8'), '{"version":1,"preferences":{"executionModel":"m"},"accounts":[]}\n');

  fs.writeFileSync(path.join(source, 'accounts.json'), '{"version":1,"preferences":{"executionModel":"changed"},"accounts":[]}\n');
  const reused = await applyPreviewReuse({ selection, sourceRoot, previewRoot, registry, previous: seeded });
  assert.equal(reused.results[0].status, 'reused');
  assert.match(fs.readFileSync(path.join(target, 'accounts.json'), 'utf8'), /"executionModel":"m"/);

  const refreshed = await applyPreviewReuse({ selection, sourceRoot, previewRoot, registry, refresh: true, previous: reused, now: () => new Date('2026-10-27T02:00:00.000Z') });
  assert.equal(refreshed.results[0].status, 'refreshed');
  assert.equal(refreshed.refreshedAt, '2026-10-27T02:00:00.000Z');
  assert.match(fs.readFileSync(path.join(target, 'accounts.json'), 'utf8'), /"executionModel":"changed"/);

  fs.rmSync(source, { recursive: true, force: true });
  const failed = await applyPreviewReuse({ selection, sourceRoot, previewRoot, registry, refresh: true, previous: refreshed });
  assert.equal(failed.results[0].status, 'failed');
  assert.equal(fs.readFileSync(path.join(target, 'accounts.json'), 'utf8'), '{"version":1,"preferences":{"executionModel":"changed"},"accounts":[]}\n');
  assert.equal(failed.seededAt, seeded.seededAt);

  // A partial copy must never publish; the previous copy and its parent stay clean.
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'accounts.json'), '{"version":1,"accounts":[]}\n');
  fs.symlinkSync(source, path.join(source, 'loop'));
  const partial = await applyPreviewReuse({ selection, sourceRoot, previewRoot, registry, refresh: true, previous: failed });
  assert.equal(partial.results[0].status, 'failed');
  assert.equal(fs.readFileSync(path.join(target, 'accounts.json'), 'utf8'), '{"version":1,"preferences":{"executionModel":"changed"},"accounts":[]}\n');
  assert.deepEqual(fs.readdirSync(path.join(previewRoot, 'agent-service')).filter((name) => name.includes('.staging-') || name.includes('.backup-')), []);
});

test('无效来源在预览路径上表现为可编码错误', () => {
  const error = previewReuseError('source', 'preview_reuse_source_unavailable', { source: 'development' });
  assert.equal(error.code, 'preview_reuse_source_unavailable');
  assert.deepEqual(error.details, { source: 'development' });
});
