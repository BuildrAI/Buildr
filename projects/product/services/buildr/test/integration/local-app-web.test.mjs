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

test('全局 Change 详情按需关联已有 Task，不增加首屏 Task 读取', () => {
  const change = fs.readFileSync('src/interfaces/local-app/web/features/change-detail.js', 'utf8');
  const actions = fs.readFileSync('src/interfaces/local-app/web/features/agent-actions.js', 'utf8');
  assert.match(change, /id="associate-change"/);
  assert.match(change, /id="change-task-association"/);
  assert.match(change, /api\('\/api\/v1\/tasks\?status=active'\)/);
  assert.match(change, /expectedRecordDigest: selected\.recordDigest/);
  assert.match(change, /addChanges: \[`\$\{change\.project\.code\}\/\$\{change\.code\}`\]/);
  assert.match(change, /navigate\(`\/tasks\/\$\{encodeURIComponent\(selected\.record\.taskId\)\}`\)/);
  assert.match(change, /task_record_conflict/);
  assert.match(change, /openAgentAction\('start', \{ projectCode: change\.project\.code/);
  assert.match(actions, /if \(context\.goal\) document\.getElementById\('action-goal'\)\.value = context\.goal/);
  const initialRead = change.slice(change.indexOf('const \[workspace, data\]'), change.indexOf('const associateButton'));
  assert.doesNotMatch(initialRead, /\/api\/v1\/tasks/);
});

test('Local App 提供独立文章入口、只读内容视图和受控本地图片资源', () => {
  const app = fs.readFileSync('src/interfaces/local-app/web/app.js', 'utf8');
  const index = fs.readFileSync('src/interfaces/local-app/web/index.html', 'utf8');
  const server = fs.readFileSync('src/interfaces/local-app/http/server.mjs', 'utf8');
  const detail = fs.readFileSync('src/interfaces/local-app/web/features/publication-detail.js', 'utf8');
  const publications = fs.readFileSync('src/interfaces/local-app/web/features/publications.js', 'utf8');
  assert.match(index, /data-nav="articles"[^>]*>.*文章/);
  assert.match(app, /'\/articles': \{ id: 'articles'/);
  assert.match(app, /'\/articles\/:publicationId'/);
  assert.match(app, /renderPublicationDetail/);
  assert.match(server, /\/features\/publications\.js/);
  assert.match(server, /suffix === '\/publications'/);
  assert.match(server, /readPublicationAsset/);
  assert.match(publications, /只读展示/);
  assert.match(detail, /imageResolver/);
  assert.match(detail, /assets\\\//);
  assert.match(detail, /返回文章目录/);
  assert.match(detail, /渲染/);
  assert.match(detail, /原文/);
  assert.doesNotMatch(detail, /innerHTML\s*=\s*data\.content/);
});

test('任务详情使用概览、研发、证据、环境四个一级视图', () => {
  const source = fs.readFileSync('src/interfaces/local-app/web/features/task-detail.js', 'utf8');
  const styles = fs.readFileSync('src/interfaces/local-app/web/styles.css', 'utf8');
  assert.equal(source.match(/data-task-tab=/g)?.length, 4);
  assert.match(source, /data-task-tab="overview"[^>]*>概览/);
  assert.match(source, /data-task-tab="development"[^>]*>研发/);
  assert.match(source, /data-task-tab="evidence"[^>]*>证据/);
  assert.match(source, /data-task-tab="environment"[^>]*>环境/);
  assert.doesNotMatch(source, /data-task-tab="(?:review|verification)"/);
  assert.match(source, /data-task-panel="evidence"/);
  assert.match(source, /if \(tab === 'evidence'\) \{ refreshReview\(\); refreshVerification\(\); \}/);
  assert.match(source, /renderReviewSlot\('planning'/);
  assert.match(source, /renderReviewSlot\('completion'/);
  assert.match(source, /current: '当前适用', stale: '目标已变化', unknown: '适用性未知'/);
  assert.match(source, /api\(`\/api\/v1\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/reviews`\)/);
  assert.match(source, /openAgentAction\('task-review', \{ taskId, reviewType \}\)/);
  assert.doesNotMatch(source, /node:fs|YAML\.parse|YAML\.stringify|writeFileSync|recordTaskReview/);
  assert.match(styles, /\.review-slot-grid \{[^}]*grid-template-columns: repeat\(2/);
  assert.match(styles, /\.review-slot-grid \{ grid-template-columns: 1fr; \}/);
});

test('任务研发视图只读投影 current Development Receipt、候选、门禁、决策与最近交接', () => {
  const source = fs.readFileSync('src/interfaces/local-app/web/features/task-detail.js', 'utf8');
  const styles = fs.readFileSync('src/interfaces/local-app/web/styles.css', 'utf8');
  assert.match(source, /任务研发（Task Development）/);
  assert.match(source, /\/development`\)/);
  assert.match(source, /handoff-current': '研发交接已就绪'/);
  assert.match(source, /candidate-current': '候选已就绪'/);
  assert.match(source, /planning: '规划中'/);
  assert.match(source, /研发规划事实/);
  assert.match(source, /developmentPlanningCard/);
  assert.match(source, /已明确豁免/);
  assert.match(source, /节点不构成必经工作流/);
  assert.match(source, /developmentGateCard\('方案审查'/);
  assert.match(source, /developmentGateCard\('任务验证'/);
  assert.match(source, /developmentGateCard\('完成审查'/);
  assert.match(source, /任务上下文身份/);
  assert.match(source, /已接受风险数/);
  assert.match(source, /const latest = handoffs\.at\(-1\)/);
  assert.match(source, /历史研发交接仍被保留，但当前无法实时复核/);
  assert.doesNotMatch(source, /recordTaskDevelopment|freezeTaskDevelopment|decideTaskDevelopment|createTaskDevelopmentHandoff/);
  assert.doesNotMatch(source, /node:fs|YAML\.parse|YAML\.stringify|writeFileSync/);
  assert.match(styles, /\.development-axis-grid/);
  assert.match(styles, /\.development-gate-grid/);
  assert.match(styles, /\.development-planning-list/);
  assert.match(styles, /\.development-axis-grid, \.development-gate-grid/);
});

test('证据视图只读展示审查与验证结果，并通过智能体动作启动专业流程', () => {
  const source = fs.readFileSync('src/interfaces/local-app/web/features/task-detail.js', 'utf8');
  const actions = fs.readFileSync('src/interfaces/local-app/web/features/agent-actions.js', 'utf8');
  assert.match(source, /验证结果（Verification Result）/);
  assert.match(source, /目标适用性/);
  assert.match(source, /声明适用性/);
  assert.match(source, /\/verification`\)/);
  assert.match(source, /openAgentAction\('task-verification', \{ taskId \}\)/);
  assert.match(actions, /\/api\/v1\/prompts\/task-verification/);
  assert.match(actions, /验证结果未被修改/);
  assert.doesNotMatch(source, /node:fs|YAML\.parse|YAML\.stringify|writeFileSync|recordTaskVerification/);
});

test('任务详情面向用户的核心术语使用中文或中英文并列', () => {
  const source = fs.readFileSync('src/interfaces/local-app/web/features/task-detail.js', 'utf8');
  const tasks = fs.readFileSync('src/interfaces/local-app/web/features/tasks.js', 'utf8');
  const change = fs.readFileSync('src/interfaces/local-app/web/features/change-detail.js', 'utf8');
  assert.match(source, /任务记录（Task Record）/);
  assert.match(source, /任务环境（Task Environment）/);
  assert.match(source, /方案审查（Planning Review）/);
  assert.match(source, /完成审查（Completion Review）/);
  assert.doesNotMatch(source, />Task Record</);
  assert.doesNotMatch(source, />Task Environment</);
  assert.doesNotMatch(source, />Planning Review</);
  assert.doesNotMatch(source, />Completion Review</);
  assert.doesNotMatch(source, />Verification Result</);
  assert.match(tasks, /正式任务由 Agent 创建/);
  assert.match(tasks, /标题或意图/);
  assert.match(tasks, /全部项目/);
  assert.match(tasks, /全部服务/);
  assert.doesNotMatch(tasks, />新建正式 Task</);
  assert.doesNotMatch(tasks, />Task ID</);
  assert.doesNotMatch(tasks, />Project scope/);
  assert.doesNotMatch(tasks, />Service scope/);
  assert.doesNotMatch(tasks, />OpenSpec Changes/);
  assert.match(change, /任务范围解析器（Task-scoped Resolver）/);
  assert.match(change, /按任务 \$\{taskId\}/);
  assert.match(change, /文件系统路径（filesystem path）/);
  assert.match(change, /保留工作区（Retained）/);
  assert.match(change, /工作副本（Working copy）/);
  assert.match(change, /保留基线（Retained baseline）/);
  assert.doesNotMatch(change, /row\('Working copy'/);
  assert.doesNotMatch(change, /row\('Retained baseline'/);
});

test('Task-scoped Change 使用 Planning Review，global Change 保留通用审查 route', () => {
  const change = fs.readFileSync('src/interfaces/local-app/web/features/change-detail.js', 'utf8');
  const tasks = fs.readFileSync('src/interfaces/local-app/web/features/tasks.js', 'utf8');
  const actions = fs.readFileSync('src/interfaces/local-app/web/features/agent-actions.js', 'utf8');
  assert.match(change, /openAgentAction\('task-review', \{ taskId, reviewType: 'planning', projectCode, change: change\.code \}\)/);
  assert.match(change, /openAgentAction\('change', \{ projectCode, ref: changeRef, action: 'review' \}\)/);
  assert.doesNotMatch(change, /querySelector\('\.panel-actions'\)\.classList\.add\('hidden'\)/);
  assert.match(actions, /\/api\/v1\/prompts\/task-review/);
  assert.match(actions, /审查结果尚未记录/);
  assert.doesNotMatch(tasks, /创建任务记录|task-create-form/);
  assert.match(change, /方案审查（Planning Review）/);
});

test('任务列表使用可取消的服务端筛选，详情首屏只读轻量视图并延迟读取 Parent 候选', () => {
  const detail = fs.readFileSync('src/interfaces/local-app/web/features/task-detail.js', 'utf8');
  const tasks = fs.readFileSync('src/interfaces/local-app/web/features/tasks.js', 'utf8');
  const server = fs.readFileSync('src/interfaces/local-app/http/server.mjs', 'utf8');
  assert.match(tasks, /new AbortController\(\)/);
  assert.match(tasks, /setTimeout\(load, 200\)/);
  assert.match(tasks, /hasChildren/);
  assert.match(tasks, /childTaskCount/);
  assert.match(tasks, /data\.totalTaskCount === 0/);
  assert.doesNotMatch(tasks, /method: 'POST'/);
  assert.match(detail, /api\('\/api\/v1\/tasks\?status=active'\)/);
  assert.match(detail, /addEventListener\('focus', loadParentOptions\)/);
  assert.match(detail, /打开时检查当前状态/);
  assert.doesNotMatch(detail, /Promise\.all\(\[api\('\/api\/v1\/workspace'\), api\(`\/api\/v1\/tasks\/\$\{encodeURIComponent\(taskId\)\}`\), api\('\/api\/v1\/tasks'\)\]\)/);
  assert.doesNotMatch(server, /request\.method === 'POST' && suffix === '\/tasks'/);
});
