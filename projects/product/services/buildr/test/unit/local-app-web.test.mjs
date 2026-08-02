import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const originalGlobals = {
  document: globalThis.document,
  window: globalThis.window,
  fetch: globalThis.fetch,
};

test.after(() => {
  for (const [key, value] of Object.entries(originalGlobals)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

test('router 解析静态、动态和 fallback 路由并保持查询参数导航', async () => {
  const listeners = {};
  globalThis.document = { addEventListener: (name, handler) => { listeners[name] = handler; } };
  globalThis.window = {
    location: { pathname: '/projects/demo', search: '?tab=services', hash: '' },
    history: { pushState: (_state, _title, destination) => { window.location.pathname = destination; window.location.search = ''; } },
    addEventListener: (name, handler) => { listeners[name] = handler; },
  };
  const { createRouter } = await import('../../src/interfaces/local-app/web/router.js');
  const rendered = [];
  const router = createRouter({
    routes: {
      '/': { id: 'home' },
      '/projects': { id: 'projects' },
      project: { id: 'project', match: (pathname) => pathname.startsWith('/projects/') ? { code: pathname.slice(10) } : null },
    },
    onRoute: async (route, pathname) => rendered.push({ route, pathname }),
  });
  await router.start();
  assert.deepEqual(rendered.at(-1), { route: { id: 'project', match: rendered.at(-1).route.match, params: { code: 'demo' } }, pathname: '/projects/demo' });
  await router.navigate('/projects');
  assert.equal(rendered.at(-1).route.id, 'projects');
  window.location.pathname = '/missing';
  await router.start();
  assert.equal(rendered.at(-1).route.id, 'home');
});

test('api client 只为写请求附加 session，并保留服务端错误结构', async () => {
  globalThis.document = { querySelector: () => ({ content: 'session-token' }) };
  const calls = [];
  globalThis.fetch = async (resource, options) => {
    calls.push({ resource, options });
    return { ok: calls.length === 1, json: async () => calls.length === 1 ? { ok: true } : { error: { message: '冲突', code: 'conflict', details: { revision: 2 } } } };
  };
  const { api } = await import(`../../src/interfaces/local-app/web/api-client.js?test=${Date.now()}`);
  assert.deepEqual(await api('/api/v1/workspace'), { ok: true });
  assert.deepEqual(calls[0].options.headers, {});
  await assert.rejects(api('/api/v1/workspace', { method: 'PUT', body: '{}' }), (error) => {
    assert.equal(error.code, 'conflict');
    assert.deepEqual(error.details, { revision: 2 });
    return true;
  });
  assert.deepEqual(calls[1].options.headers, { 'content-type': 'application/json', 'x-buildr-session': 'session-token' });
});

test('Change 详情先提供人类可读 Brief，再展示技术 artifacts', () => {
  const source = fs.readFileSync('src/interfaces/local-app/web/features/change-detail.js', 'utf8');
  const styles = fs.readFileSync('src/interfaces/local-app/web/styles.css', 'utf8');
  const markdown = fs.readFileSync('src/interfaces/local-app/web/markdown.js', 'utf8');
  assert.ok(source.indexOf('id="change-brief"') < source.indexOf('technical-artifacts-panel'));
  assert.match(source, /import \{ renderMarkdown \} from '\/markdown\.js'/);
  assert.match(source, /briefPanel\(change\.brief\)/);
  assert.match(source, /这个变更还没有人类可读 Brief/);
  assert.match(source, /contentView\(artifact\.content/);
  assert.match(source, /contentView\(brief\.content/);
  assert.match(source, /headingOffset:\s*1/);
  assert.match(source, /allowRelativeLinks:\s*true/);
  assert.match(source, /textContent = '渲染'/);
  assert.match(source, /textContent = '原文'/);
  assert.match(source, /content-view-source/);
  assert.doesNotMatch(source, /brief\.content.*innerHTML/);
  assert.doesNotMatch(source, /artifact\.content.*innerHTML/);
  assert.doesNotMatch(markdown, /innerHTML/);
  assert.match(markdown, /headingOffset/);
  assert.match(markdown, /allowRelativeLinks/);
  assert.match(markdown, /resolveSafeHref/);
  assert.match(styles, /\.change-brief-panel/);
  assert.match(styles, /\.brief-content/);
  assert.match(styles, /\.markdown-body/);
  assert.match(styles, /\.artifact-content/);
  assert.match(styles, /\.content-view-toggle/);
});

test('Task 详情以只读审查页签展示两个 Result 槽位和三种 applicability', () => {
  const source = fs.readFileSync('src/interfaces/local-app/web/features/task-detail.js', 'utf8');
  const styles = fs.readFileSync('src/interfaces/local-app/web/styles.css', 'utf8');
  assert.match(source, /data-task-tab="review"/);
  assert.match(source, /renderReviewSlot\('planning'/);
  assert.match(source, /renderReviewSlot\('completion'/);
  assert.match(source, /current: '当前适用', stale: '目标已变化', unknown: '适用性未知'/);
  assert.match(source, /api\(`\/api\/v1\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/reviews`\)/);
  assert.match(source, /openAgentAction\('task-review', \{ taskId, reviewType \}\)/);
  assert.doesNotMatch(source, /node:fs|YAML\.parse|YAML\.stringify|writeFileSync|recordTaskReview/);
  assert.match(styles, /\.review-slot-grid \{[^}]*grid-template-columns: repeat\(2/);
  assert.match(styles, /\.review-slot-grid \{ grid-template-columns: 1fr; \}/);
});

test('Task-scoped Change 使用 Planning Review，global Change 保留通用审查 route', () => {
  const change = fs.readFileSync('src/interfaces/local-app/web/features/change-detail.js', 'utf8');
  const actions = fs.readFileSync('src/interfaces/local-app/web/features/agent-actions.js', 'utf8');
  assert.match(change, /openAgentAction\('task-review', \{ taskId, reviewType: 'planning', projectCode, change: change\.code \}\)/);
  assert.match(change, /openAgentAction\('change', \{ projectCode, ref: changeRef, action: 'review' \}\)/);
  assert.doesNotMatch(change, /querySelector\('\.panel-actions'\)\.classList\.add\('hidden'\)/);
  assert.match(actions, /\/api\/v1\/prompts\/task-review/);
  assert.match(actions, /Review Result 尚未记录/);
});
