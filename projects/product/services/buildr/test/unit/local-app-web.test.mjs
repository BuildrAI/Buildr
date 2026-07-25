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
  assert.ok(source.indexOf('id="change-brief"') < source.indexOf('technical-artifacts-panel'));
  assert.match(source, /briefPanel\(change\.brief\)/);
  assert.match(source, /这个变更还没有人类可读 Brief/);
  assert.match(source, /textContent = itemMatch\[1\]/);
  assert.doesNotMatch(source, /brief\.content.*innerHTML/);
  assert.match(styles, /\.change-brief-panel/);
  assert.match(styles, /\.brief-content/);
});
