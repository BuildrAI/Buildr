import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createTaskReadLifecycle } from '../../../buildr-web/src/features/task/hooks/useTaskRequestLifecycle.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relative: any): any  {
  return fs.readFileSync(path.join(productRoot, relative), 'utf8');
}

function deferredTaskRead(signal: any, calls: any): any  {
  calls.count += 1;
  let resolve: any;
  const promise: any = new Promise((complete: any, reject: any) => {
    resolve = complete;
    signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
  });
  return { promise, resolve };
}

test('Task 读取生命周期去重同一 Task/operation，并在路由离开时只取消旧 Task', async () => {
  const lifecycle: any = createTaskReadLifecycle();
  const calls: any = { count: 0 };
  let oldRead: any;
  const first: any = lifecycle.run('parent-old', 'coordination', (signal: any) => {
    oldRead = deferredTaskRead(signal, calls);
    return oldRead.promise;
  });
  const duplicate: any = lifecycle.run('parent-old', 'coordination', () => {
    throw new Error('duplicate request must reuse the in-flight Promise');
  });
  assert.equal(first, duplicate);
  assert.equal(calls.count, 0, 'request starts in a microtask');
  await Promise.resolve();
  assert.equal(calls.count, 1);

  let currentRead: any;
  const current: any = lifecycle.run('parent-current', 'coordination', (signal: any) => {
    currentRead = deferredTaskRead(signal, calls);
    return currentRead.promise;
  });
  await Promise.resolve();
  lifecycle.abortTask('parent-old');
  await assert.rejects(first, (error: any) => error.name === 'AbortError');
  currentRead.resolve({ taskId: 'parent-current' });
  assert.deepEqual(await current, { taskId: 'parent-current' });
  assert.equal(calls.count, 2);
});

test('React App 路由覆盖 workspace 深链并回退未知路径', () => {
  const app: any = read('../buildr-web/src/App.tsx');
  assert.match(app, /path="\/workspaces\/:workspaceId"/);
  assert.match(app, /path="tasks" element=\{<TasksSection \/>\}/);
  assert.match(app, /<Route index element=\{<Navigate to="tasks" replace \/>\} \/>/);
  assert.match(app, /path="overview" element=\{<Navigate to="\.\.\/tasks" replace \/>\} \/>/);
  assert.doesNotMatch(app, /OverviewPage/);
  assert.match(app, /path=":taskId"/);
  assert.match(app, /path=":taskId\/changes\/:projectCode\/:changeCode"/);
  assert.match(app, /path="projects" element=\{<ProjectsSection \/>\}/);
  assert.match(app, /path=":projectCode"/);
  assert.match(app, /path=":projectCode\/edit"/);
  assert.match(app, /path="services"/);
  assert.match(app, /path="articles"/);
  assert.match(app, /path="articles\/:publicationId"/);
  assert.match(app, /<Route path="\*" element=\{<Navigate to="\." replace \/>\} \/>/);
  assert.doesNotMatch(app, /path=["']\/changes["']/);
  assert.doesNotMatch(app, /cdn|unpkg|jsdelivr|googleapis/i);
});

test('API client 通过 LocalSessionAdapter 为写请求附加 session，并拒绝 filesystem path 字段语义', () => {
  const client: any = read('../buildr-web/src/api/client.ts');
  const adapter: any = read('../buildr-web/src/api/LocalSessionAdapter.ts');
  const session: any = read('src/web/http/session.ts');
  assert.match(adapter, /x-buildr-session/);
  assert.match(adapter, /meta\[name="buildr-session"\]/);
  assert.match(client, /sessionAdapter\.writeHeaders/);
  assert.match(client, /if \(init\.body\)/);
  assert.match(client, /error\.code = body\.error\?\.code/);
  assert.match(client, /error\.details = body\.error\?\.details/);
  assert.doesNotMatch(client, /document\.|querySelector|buildr-session/);
  assert.match(session, /\['target', 'root', 'path'\]\.includes\(field\)/);
  assert.match(session, /Task API 不接受 filesystem path/);
});

test('Task-scoped Change 详情先提供人类可读 Brief，再展示技术 artifacts', () => {
  const source: any = read('../buildr-web/src/pages/TaskChangeDetailPage.tsx');
  const briefPanel: any = read('../buildr-web/src/components/ChangeBriefPanel.tsx');
  const styles: any = read('../buildr-web/src/styles.css');
  const markdown: any = read('../buildr-web/src/markdown.ts');
  assert.ok(source.indexOf('id="change-brief"') < source.indexOf('technical-artifacts-panel'));
  assert.match(source, /MarkdownHost/);
  assert.match(source, /ChangeBriefPanel/);
  assert.match(briefPanel, /没有可读取的 Brief/);
  assert.match(briefPanel, /headingOffset:\s*1/);
  assert.match(briefPanel, /allowRelativeLinks:\s*true/);
  assert.doesNotMatch(source, /brief\.content.*innerHTML|artifact\.content.*innerHTML|dangerouslySetInnerHTML/);
  assert.doesNotMatch(markdown, /innerHTML/);
  assert.match(markdown, /headingOffset/);
  assert.match(markdown, /allowRelativeLinks/);
  assert.match(markdown, /resolveSafeHref/);
  assert.match(styles, /\.change-brief-panel/);
  assert.match(briefPanel, /className="brief-content markdown-body"/);
  assert.match(styles, /\.markdown-body/);
  assert.match(styles, /\.artifact-content/);
  assert.match(styles, /\.content-view-toggle/);
});

test('Change 仅作为 Task-scoped 只读内容', () => {
  const change: any = read('../buildr-web/src/pages/TaskChangeDetailPage.tsx');
  const app: any = read('../buildr-web/src/App.tsx');
  const server: any = read('src/web/http/server.ts');
  assert.match(change, /\/api\/v1\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/changes/);
  assert.doesNotMatch(change, /associate-change|addChanges|openAgentAction/);
  assert.doesNotMatch(app, /path=["']\/changes["']/);
  assert.doesNotMatch(server, /suffix === '\/changes'|change-create|change-action|addChanges/);
});

test('Buildr Web 提供独立文章入口、只读内容视图和受控本地图片资源', () => {
  const app: any = read('../buildr-web/src/App.tsx');
  const layout: any = read('../buildr-web/src/app/AppLayout.tsx');
  const index: any = read('../buildr-web/index.html');
  const server: any = read('src/web/http/server.ts');
  const staticFiles: any = read('src/web/http/static-files.ts');
  const publicationHttp: any = read('src/system/publication/interfaces/http/publication-http.ts');
  const detail: any = read('../buildr-web/src/pages/ArticleDetailPage.tsx');
  const publications: any = read('../buildr-web/src/pages/ArticlesPage.tsx');
  assert.match(layout, /data-nav=\{item\.nav\}/);
  assert.match(layout, /nav: 'articles', label: '文章'/);
  assert.match(app, /path="articles"/);
  assert.match(app, /path="articles\/:publicationId"/);
  assert.match(app, /ArticleDetailPage/);
  assert.match(index, /buildr-session/);
  assert.doesNotMatch(index, /cdn|unpkg|jsdelivr|googleapis/i);
  assert.match(staticFiles, /STATIC_ROOT[\s\S]*web-dist/);
  assert.match(publicationHttp, /suffix === '\/publications'/);
  assert.match(publicationHttp, /readPublicationAsset/);
  assert.doesNotMatch(server, /STATIC_ASSETS|features\/publications\.js/);
  assert.match(publications, /只读展示/);
  assert.match(detail, /imageResolver/);
  assert.match(detail, /assets\//);
  assert.match(detail, /返回文章目录/);
  assert.match(detail, /渲染|原文|source/);
  assert.doesNotMatch(detail, /innerHTML\s*=\s*data\.content|dangerouslySetInnerHTML/);
});

test('任务详情只使用概览、原型、证据三个一级视图，复盘文档位于概览', () => {
  const source: any = read('../buildr-web/src/features/task/pages/TaskDetailPage.tsx');
  const coordination: any = read('../buildr-web/src/features/task/components/ParentCoordinationPanel.tsx');
  const evidence: any = read('../buildr-web/src/features/task/components/EvidenceTab.tsx');
  const retrospective: any = read('../buildr-web/src/features/task/components/RetrospectiveDocumentCard.tsx');
  const completeModal: any = read('../buildr-web/src/features/task/components/TaskCompleteModal.tsx');
  const evidenceHook: any = read('../buildr-web/src/features/task/hooks/useTaskEvidence.ts');
  const retrospectiveHook: any = read('../buildr-web/src/features/task/hooks/useTaskRetrospective.ts');
  const styles: any = read('../buildr-web/src/styles.css');
  assert.equal(source.match(/data-task-tab=\{tab\.id\}/g)?.length, 1);
  assert.match(source, /id: 'overview', label: '概览'/);
  assert.match(source, /id: 'prototype', label: '原型'/);
  assert.doesNotMatch(source, /id: 'development', label: '研发'/);
  assert.match(source, /id: 'evidence', label: '证据'/);
  assert.doesNotMatch(source, /id: 'retrospective', label: '复盘'/);
  assert.doesNotMatch(source, /id: 'environment', label: '环境'/);
  assert.match(source, /ParentCoordinationPanel/);
  assert.match(evidenceHook, /taskProfessionalApi\.coordination\(taskId, \{ signal \}\)/);
  assert.match(coordination, /id="task-parent-coordination"/);
  assert.match(coordination, /taskHref\(child\.taskId\)/);
  assert.match(completeModal, /ParentCompletionFields/);
  assert.doesNotMatch(source, /id: '(?:review|verification)'/);
  assert.match(source, /data-task-panel="prototype"|PrototypeTab/);
  assert.match(evidence, /data-task-panel="evidence"/);
  assert.match(source, /RetrospectiveDocumentCard/);
  assert.match(retrospective, /task-retrospective-document-card/);
  assert.match(retrospective, /本机文档/);
  assert.match(retrospective, /MarkdownHost[\s\S]*document\.content|document\.content[\s\S]*MarkdownHost/);
  assert.match(retrospectiveHook, /taskApi\.retrospectiveDocument\(taskId\)/);
  assert.match(retrospectiveHook, /retrospectiveState: 'decided'/);
  assert.match(retrospective, /我已完成决定/);
  assert.doesNotMatch(retrospective, /no-action|handled|重新打开/);
  assert.doesNotMatch(source, /openAgentAction\('task-retrospective'/);
  assert.match(source, /if \(tab === 'evidence'\) \{[\s\S]*evidence\.refreshReview\(\);[\s\S]*evidence\.refreshVerification\(\);/);
  assert.match(evidence, /reviewType === 'planning'|openAgentAction\('task-review'/);
  assert.match(evidence, /openAgentAction\('task-review', \{ taskId, reviewType \}\)/);
  assert.match(evidence, /stateText = present \? '已记录' : '未记录'/);
  assert.match(evidenceHook, /taskProfessionalApi\.reviews\(taskId, \{ signal \}\)/);
  assert.doesNotMatch(source, /node:fs|YAML\.parse|YAML\.stringify|writeFileSync|recordTaskReview/);
  assert.doesNotMatch(evidence, /node:fs|YAML\.parse|YAML\.stringify|writeFileSync|recordTaskReview/);
  assert.match(styles, /\.review-slot-grid \{[^}]*grid-template-columns: repeat\(2/);
  assert.match(styles, /\.review-slot-grid \{ display: grid; grid-template-columns: repeat\(2/);
});

test('任务 UI Prototype 只读按需加载并在离线 opaque-origin iframe 中展示', () => {
  const source: any = read('../buildr-web/src/features/task/pages/TaskDetailPage.tsx');
  const prototype: any = read('../buildr-web/src/features/task/components/PrototypeTab.tsx');
  const artifactsHook: any = read('../buildr-web/src/features/task/hooks/useTaskArtifacts.ts');
  const server: any = read('src/web/http/server.ts');
  const responses: any = read('src/web/http/responses.ts');
  const changeHttp: any = read('src/task/change/interfaces/http/change-http.ts');
  const styles: any = read('../buildr-web/src/styles.css');
  assert.match(source, /if \(tab === 'prototype'\) void artifacts\.refreshPrototype\(\)/);
  assert.match(artifactsHook, /'ui-prototypes'/);
  assert.match(prototype, /界面原型/);
  assert.match(prototype, /用于约束后续页面和交互开发/);
  assert.match(prototype, /原型页面列表/);
  assert.match(prototype, /prototypes\.map/);
  assert.match(prototype, /sandbox="allow-scripts"/);
  assert.doesNotMatch(prototype, /allow-same-origin/);
  assert.match(prototype, /src=\{prototypeSource\}/);
  assert.doesNotMatch(prototype, /srcDoc=/);
  assert.doesNotMatch(prototype, /dangerouslySetInnerHTML/);
  assert.match(changeHttp, /\/ui-prototypes\$`\)/);
  assert.match(changeHttp, /request\.method === 'GET'.*taskUiPrototypes/s);
  assert.equal((changeHttp.match(/application\.taskUiPrototypes\(/g) || []).length, 1);
  assert.match(changeHttp, /ui-prototypes\/\(\[a-f0-9\]\{32\}\)/);
  assert.equal((changeHttp.match(/application\.taskUiPrototype\(/g) || []).length, 1);
  assert.doesNotMatch(server, /\/ui-previews/);
  assert.match(responses, /sandbox allow-scripts/);
  assert.match(responses, /connect-src 'none'/);
  assert.match(responses, /form-action 'none'/);
  assert.match(responses, /frame-ancestors 'self'/);
  assert.match(styles, /\.ui-prototype-layout/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.ui-prototype-frame/);
});

test('任务研发页签、客户端调用与专属样式已退出', () => {
  const detail: any = read('../buildr-web/src/features/task/pages/TaskDetailPage.tsx');
  const evidenceHook: any = read('../buildr-web/src/features/task/hooks/useTaskEvidence.ts');
  const styles: any = read('../buildr-web/src/styles.css');
  assert.equal(fs.existsSync(path.join(productRoot, '../buildr-web/src/features/task/components/DevelopmentTab.tsx')), false);
  assert.doesNotMatch(detail, /taskProfessionalApi\.development|DevelopmentTab|data-task-panel="development"/);
  assert.doesNotMatch(styles, /\.development-axis-grid|\.development-planning-list/);
});

test('证据视图只读展示审查与验证结果，并通过智能体动作启动专业流程', () => {
  const source: any = read('../buildr-web/src/features/task/components/EvidenceTab.tsx');
  const actions: any = read('../buildr-web/src/app/AgentActionDrawer.tsx');
  const detail: any = read('../buildr-web/src/features/task/pages/TaskDetailPage.tsx');
  const evidenceHook: any = read('../buildr-web/src/features/task/hooks/useTaskEvidence.ts');
  assert.match(source, /任务验证报告（Task Verification Report）/);
  assert.match(source, /内容适用性/);
  assert.match(source, /测试地图适用性/);
  assert.match(evidenceHook, /taskProfessionalApi\.verification\(taskId, \{ signal \}\)/);
  assert.match(source, /openAgentAction\('task-verification', \{ taskId \}\)/);
  assert.doesNotMatch(actions, /taskProfessionalApi\.(?:reviewPrompt|verificationPrompt)\(/);
  assert.match(actions, /读取并遵循 task-verification Skill/);
  assert.match(actions, /验证报告未被修改/);
  assert.doesNotMatch(source, /node:fs|YAML\.parse|YAML\.stringify|writeFileSync|recordTaskVerification/);
});

test('任务详情面向用户的核心术语使用中文或中英文并列', () => {
  const source: any = read('../buildr-web/src/features/task/pages/TaskDetailPage.tsx');
  const evidence: any = read('../buildr-web/src/features/task/components/EvidenceTab.tsx');
  const tasks: any = read('../buildr-web/src/features/task/pages/TasksPage.tsx');
  const change: any = read('../buildr-web/src/pages/TaskChangeDetailPage.tsx');
  assert.match(source, /任务记录（Task Record）/);
  assert.match(evidence, /方案审查（Planning Review）/);
  assert.match(evidence, /完成审查（Completion Review）/);
  assert.doesNotMatch(source, />Task Record</);
  assert.equal(fs.existsSync(path.join(productRoot, '../buildr-web/src/features/task/components/EnvironmentTab.tsx')), false);
  assert.doesNotMatch(evidence, />Planning Review</);
  assert.doesNotMatch(evidence, />Completion Review</);
  assert.doesNotMatch(evidence, />Verification Result</);
  assert.match(tasks, /正式任务由 Agent 创建/);
  assert.match(tasks, /搜索标题、意图或编号/);
  assert.match(tasks, /全部项目/);
  assert.match(tasks, /全部服务/);
  assert.doesNotMatch(tasks, />新建正式 Task</);
  assert.doesNotMatch(tasks, />Task ID</);
  assert.doesNotMatch(tasks, />Project scope/);
  assert.doesNotMatch(tasks, />Service scope/);
  assert.doesNotMatch(tasks, />OpenSpec Changes</);
  assert.match(change, /任务关联变更|关联变更/);
  assert.match(change, /只读展示当前任务已关联的 OpenSpec 内容/);
  assert.match(change, /工作副本/);
  assert.match(change, /保留基线/);
  assert.doesNotMatch(change, /openAgentAction|addChanges/);
});

test('Task-scoped Change 保持只读，不提供 Change 审查 route', () => {
  const change: any = read('../buildr-web/src/pages/TaskChangeDetailPage.tsx');
  const tasks: any = read('../buildr-web/src/features/task/pages/TasksPage.tsx');
  const app: any = read('../buildr-web/src/App.tsx');
  assert.doesNotMatch(change, /openAgentAction|continue-change|review-change|associate-change/);
  assert.doesNotMatch(tasks, /创建任务记录|task-create-form/);
  assert.doesNotMatch(app, /path=["'][^"']*review-change/);
});

test('任务意图以 Markdown 链接展示 Project 内的只读文档', () => {
  const detail: any = read('../buildr-web/src/features/task/pages/TaskDetailPage.tsx');
  const prototype: any = read('../buildr-web/src/features/task/components/TaskDocumentPreviewModal.tsx');
  const overview: any = read('../buildr-web/src/features/task/components/TaskOverview.tsx');
  const artifactsHook: any = read('../buildr-web/src/features/task/hooks/useTaskArtifacts.ts');
  const resolver: any = read('../buildr-web/src/lib/taskDocumentLinks.ts');
  const sharedResolver: any = read('../buildr-web/src/lib/workspaceMarkdownReferences.ts');
  assert.match(overview, /id="task-detail-intent"[\s\S]*MarkdownHost/);
  assert.match(artifactsHook, /resolveTaskDocumentReference/);
  assert.match(artifactsHook, /api\('\/api\/v1\/projects'\)/);
  assert.match(detail, /TaskDocumentPreviewModal/);
  assert.match(artifactsHook, /\/api\/v1\/projects\/\$\{encodeURIComponent\(reference\.projectCode\)\}\/documents/);
  assert.match(prototype, /resolveProjectMarkdownHref/);
  assert.match(prototype, /相关资料/);
  assert.match(resolver, /resolveWorkspaceMarkdownReference\(href, allowedProjects, projects\)/);
  assert.match(sharedResolver, /allowedProjectCodes\.has\(project\.code\)/);
  assert.match(sharedResolver, /\.endsWith\('\.md'\)/);
  assert.doesNotMatch(detail, /taskAttachment|attachmentId|\/attachments/);
});

test('任务列表使用可取消的服务端筛选，详情首屏只读轻量视图并延迟读取 Parent 候选', () => {
  const detail: any = read('../buildr-web/src/features/task/pages/TaskDetailPage.tsx');
  const taskReadLifecycle: any = read('../buildr-web/src/features/task/hooks/useTaskRequestLifecycle.ts');
  const detailHook: any = read('../buildr-web/src/features/task/hooks/useTaskDetail.ts');
  const actionsHook: any = read('../buildr-web/src/features/task/hooks/useTaskActions.ts');
  const tasks: any = read('../buildr-web/src/features/task/pages/TasksPage.tsx');
  const listHook: any = read('../buildr-web/src/features/task/hooks/useTaskList.ts');
  const taskDto: any = read('../buildr-web/src/features/task/api/generated/task-dto.ts');
  const server: any = read('src/web/http/server.ts');
  assert.match(listHook, /new AbortController\(\)/);
  assert.match(tasks, /matchesTaskQuery/);
  assert.match(tasks, /hasChildren/);
  assert.match(tasks, /retrospectiveState/);
  assert.match(tasks, /value: 'pending-decision', label: '等待决定'/);
  assert.match(tasks, /value: 'decided', label: '已经决定'/);
  assert.doesNotMatch(tasks, /value: 'handled'|value: 'no-action'/);
  assert.match(tasks, /useState<TaskStatusFilter>\('open'\)/);
  assert.match(tasks, /setDraftStatus\('open'\)/);
  assert.match(listHook, /generation\.current !== current/);
  assert.match(tasks, /value: 'open', label: '未结束（待办 \+ 进行中）'/);
  assert.match(tasks, /value: 'todo', label: '待办'/);
  assert.doesNotMatch(taskDto, /childTaskIds|childTaskCount|storedChangeReferences/);
  assert.match(tasks, /totalTaskCount|还没有正式任务记录/);
  assert.match(tasks, /当前筛选没有匹配任务/);
  assert.match(tasks, /type="warning"/);
  assert.match(tasks, /历史引用诊断，任务列表读取正常/);
  assert.match(detail, /id="task-record-id"/);
  assert.doesNotMatch(tasks, /method:\s*'POST'/);
  assert.match(actionsHook, /taskApi\.list\(\{ status: 'active' \}\)/);
  assert.match(detail, /addEventListener\('focus'/);
  assert.match(actionsHook, /loadParentOptions/);
  assert.match(detailHook, /lifecycle\.abortTask\(taskId\)/);
  assert.match(detail, /activeTabRef\.current/);
  assert.match(taskReadLifecycle, /pending\.get\(key\)/);
  assert.match(taskReadLifecycle, /entry\.controller\.abort\(\)/);
  assert.match(detail, /打开时检查当前状态/);
  assert.doesNotMatch(detail, /Promise\.all\(\[api\('\/api\/v1\/workspace'\), api\(`\/api\/v1\/tasks\/\$\{encodeURIComponent\(taskId\)\}`\), api\('\/api\/v1\/tasks'\)\]\)/);
  assert.doesNotMatch(server, /request\.method === 'POST' && suffix === '\/tasks'/);
});

test('Task feature 只保留 pages、hooks、components、api 四类职责', () => {
  const featureRoot = path.join(productRoot, '../buildr-web/src/features/task');
  assert.deepEqual(fs.readdirSync(featureRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(), ['api', 'components', 'hooks', 'pages']);
  const globalApi = read('../buildr-web/src/api/index.ts');
  assert.doesNotMatch(globalApi, /features\/task/);
  for (const directory of ['pages', 'components']) {
    for (const name of fs.readdirSync(path.join(featureRoot, directory))) {
      if (!name.endsWith('.ts') && !name.endsWith('.tsx')) continue;
      const source = fs.readFileSync(path.join(featureRoot, directory, name), 'utf8');
      assert.doesNotMatch(source, /from ['"]\.\.\/\.\.\/\.\.\/api['"]|\btaskApi\.|\btaskProfessionalApi\.|\bapi\(/, `${directory}/${name}`);
    }
  }
  const detailHook = read('../buildr-web/src/features/task/hooks/useTaskDetail.ts');
  const actionsHook = read('../buildr-web/src/features/task/hooks/useTaskActions.ts');
  const evidence = read('../buildr-web/src/features/task/components/EvidenceTab.tsx');
  assert.match(detailHook, /useState<TaskDetailResponse \| null>/);
  assert.match(actionsHook, /export function useTaskActions/);
  assert.doesNotMatch(evidence, /\bany\b/);
  assert.equal(fs.existsSync(path.join(featureRoot, 'hooks/useTaskMutations.ts')), false);
});
