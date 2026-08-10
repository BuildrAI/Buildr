import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relative) {
  return fs.readFileSync(path.join(productRoot, relative), 'utf8');
}

test('React App 路由覆盖 workspace 深链并回退未知路径', () => {
  const app = read('../buildr-web/src/App.tsx');
  assert.match(app, /path="\/workspaces\/:workspaceId"/);
  assert.match(app, /path="tasks"/);
  assert.match(app, /path="tasks\/:taskId"/);
  assert.match(app, /path="tasks\/:taskId\/changes\/:projectCode\/:changeCode"/);
  assert.match(app, /path="projects"/);
  assert.match(app, /path="projects\/:projectCode"/);
  assert.match(app, /path="services"/);
  assert.match(app, /path="articles"/);
  assert.match(app, /path="articles\/:publicationId"/);
  assert.match(app, /<Route path="\*" element=\{<Navigate to="\." replace \/>\} \/>/);
  assert.doesNotMatch(app, /path=["']\/changes["']/);
  assert.doesNotMatch(app, /cdn|unpkg|jsdelivr|googleapis/i);
});

test('API client 通过 LocalSessionAdapter 为写请求附加 session，并拒绝 filesystem path 字段语义', () => {
  const client = read('../buildr-web/src/api/client.ts');
  const adapter = read('../buildr-web/src/api/LocalSessionAdapter.ts');
  const server = read('src/interfaces/local-app/http/server.mjs');
  assert.match(adapter, /x-buildr-session/);
  assert.match(adapter, /meta\[name="buildr-session"\]/);
  assert.match(client, /sessionAdapter\.writeHeaders/);
  assert.match(client, /if \(init\.body\)/);
  assert.match(client, /error\.code = body\.error\?\.code/);
  assert.match(client, /error\.details = body\.error\?\.details/);
  assert.doesNotMatch(client, /document\.|querySelector|buildr-session/);
  assert.match(server, /\['target', 'root', 'path'\]\.includes\(field\)/);
  assert.match(server, /Task API 不接受 filesystem path/);
});

test('Task-scoped Change 详情先提供人类可读 Brief，再展示技术 artifacts', () => {
  const source = read('../buildr-web/src/pages/TaskChangeDetailPage.tsx');
  const styles = read('../buildr-web/src/styles.css');
  const markdown = read('../buildr-web/src/markdown.ts');
  assert.ok(source.indexOf('id="change-brief"') < source.indexOf('technical-artifacts-panel'));
  assert.match(source, /MarkdownHost/);
  assert.match(source, /ChangeBriefPanel/);
  assert.match(source, /没有可读取的 Brief/);
  assert.match(source, /headingOffset:\s*1/);
  assert.match(source, /allowRelativeLinks:\s*true/);
  assert.doesNotMatch(source, /brief\.content.*innerHTML|artifact\.content.*innerHTML|dangerouslySetInnerHTML/);
  assert.doesNotMatch(markdown, /innerHTML/);
  assert.match(markdown, /headingOffset/);
  assert.match(markdown, /allowRelativeLinks/);
  assert.match(markdown, /resolveSafeHref/);
  assert.match(styles, /\.change-brief-panel/);
  assert.match(source, /className="brief-content markdown-body"/);
  assert.match(styles, /\.markdown-body/);
  assert.match(styles, /\.artifact-content/);
  assert.match(styles, /\.content-view-toggle/);
});

test('Change 仅作为 Task-scoped 只读内容', () => {
  const change = read('../buildr-web/src/pages/TaskChangeDetailPage.tsx');
  const app = read('../buildr-web/src/App.tsx');
  const server = read('src/interfaces/local-app/http/server.mjs');
  assert.match(change, /\/api\/v1\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/changes/);
  assert.doesNotMatch(change, /associate-change|addChanges|openAgentAction/);
  assert.doesNotMatch(app, /path=["']\/changes["']/);
  assert.doesNotMatch(server, /suffix === '\/changes'|change-create|change-action|addChanges/);
});

test('Local App 提供独立文章入口、只读内容视图和受控本地图片资源', () => {
  const app = read('../buildr-web/src/App.tsx');
  const layout = read('../buildr-web/src/app/AppLayout.tsx');
  const index = read('../buildr-web/index.html');
  const server = read('src/interfaces/local-app/http/server.mjs');
  const detail = read('../buildr-web/src/pages/ArticleDetailPage.tsx');
  const publications = read('../buildr-web/src/pages/ArticlesPage.tsx');
  assert.match(layout, /data-nav="articles"[^>]*>[\s\S]*文章/);
  assert.match(app, /path="articles"/);
  assert.match(app, /path="articles\/:publicationId"/);
  assert.match(app, /ArticleDetailPage/);
  assert.match(index, /buildr-session/);
  assert.doesNotMatch(index, /cdn|unpkg|jsdelivr|googleapis/i);
  assert.match(server, /STATIC_ROOT[\s\S]*web-dist/);
  assert.match(server, /suffix === '\/publications'/);
  assert.match(server, /readPublicationAsset/);
  assert.doesNotMatch(server, /STATIC_ASSETS|features\/publications\.js/);
  assert.match(publications, /只读展示/);
  assert.match(detail, /imageResolver/);
  assert.match(detail, /assets\//);
  assert.match(detail, /返回文章目录/);
  assert.match(detail, /渲染|原文|source/);
  assert.doesNotMatch(detail, /innerHTML\s*=\s*data\.content|dangerouslySetInnerHTML/);
});

test('任务详情使用概览、研发、证据、复盘、环境五个一级视图', () => {
  const source = read('../buildr-web/src/pages/TaskDetailPage.tsx');
  const evidence = read('../buildr-web/src/pages/task-detail/EvidenceTab.tsx');
  const retrospective = read('../buildr-web/src/pages/task-detail/RetrospectiveTab.tsx');
  const styles = read('../buildr-web/src/styles.css');
  assert.equal(source.match(/data-task-tab=\{tab\.id\}/g)?.length, 1);
  assert.match(source, /id: 'overview', label: '概览'/);
  assert.match(source, /id: 'development', label: '研发'/);
  assert.match(source, /id: 'evidence', label: '证据'/);
  assert.match(source, /id: 'retrospective', label: '复盘'/);
  assert.match(source, /id: 'environment', label: '环境'/);
  assert.match(source, /id="task-parent-coordination"/);
  assert.match(source, /\/coordination`\)/);
  assert.match(source, /Parent Coordination Application 的派生 read model/);
  assert.match(source, /parent_plan_absent/);
  assert.match(source, /prerequisitesSatisfied[\s\S]*显式最终集成验收/);
  assert.doesNotMatch(source, /id: '(?:review|verification)'/);
  assert.match(evidence, /data-task-panel="evidence"/);
  assert.match(retrospective, /data-task-panel="retrospective"/);
  assert.match(retrospective, /尚未复盘/);
  assert.match(retrospective, /MarkdownHost[\s\S]*reportMarkdown|reportMarkdown[\s\S]*MarkdownHost/);
  assert.match(source, /\/retrospective`\)/);
  assert.match(source, /method: 'PATCH'[\s\S]*expectedCurrentDigest/);
  assert.match(source, /task_retrospective_conflict[\s\S]*已刷新为最新状态/);
  assert.match(source, /retrospectiveMutationRef\.current === mutationId[\s\S]*taskIdRef\.current === currentTaskId/);
  assert.match(retrospective, /task-retrospective-no-action[\s\S]*无需处理/);
  assert.match(retrospective, /task-retrospective-handle[\s\S]*标记已处理/);
  assert.match(retrospective, /task-retrospective-reopen[\s\S]*重新打开/);
  assert.doesNotMatch(source, /openAgentAction\('task-retrospective'/);
  assert.match(source, /if \(tab === 'evidence'\) \{[\s\S]*refreshReview\(\);[\s\S]*refreshVerification\(\);/);
  assert.match(evidence, /reviewType === 'planning'|openAgentAction\('task-review'/);
  assert.match(evidence, /openAgentAction\('task-review', \{ taskId, reviewType \}\)/);
  assert.match(evidence, /current: '当前适用', stale: '目标已变化', unknown: '适用性未知'/);
  assert.match(source, /api\(`\/api\/v1\/tasks\/\$\{encodeURIComponent\(currentTaskId\)\}\/reviews`\)/);
  assert.doesNotMatch(source, /node:fs|YAML\.parse|YAML\.stringify|writeFileSync|recordTaskReview/);
  assert.doesNotMatch(evidence, /node:fs|YAML\.parse|YAML\.stringify|writeFileSync|recordTaskReview/);
  assert.match(styles, /\.review-slot-grid \{[^}]*grid-template-columns: repeat\(2/);
  assert.match(styles, /\.review-slot-grid \{ display: grid; grid-template-columns: repeat\(2/);
});

test('任务研发视图只读投影 current Development Receipt、候选、门禁、决策与最近交接', () => {
  const source = read('../buildr-web/src/pages/task-detail/DevelopmentTab.tsx');
  const labels = read('../buildr-web/src/lib/taskLabels.ts');
  const detail = read('../buildr-web/src/pages/TaskDetailPage.tsx');
  const styles = read('../buildr-web/src/styles.css');
  assert.match(source, /任务研发（Task Development）/);
  assert.match(detail, /\/development`\)/);
  assert.match(labels, /'handoff-current': '研发交接已就绪'/);
  assert.match(labels, /'candidate-current': '候选已就绪'/);
  assert.match(labels, /planning: '规划中'/);
  assert.match(source, /研发规划事实/);
  assert.match(source, /development-planning-card|developmentPlanning/);
  assert.match(labels, /waived: '已明确豁免'/);
  assert.match(source, /节点不构成必经工作流/);
  assert.match(source, /方案审查/);
  assert.match(source, /任务验证/);
  assert.match(source, /完成审查/);
  assert.match(source, /任务上下文身份|development-identity/);
  assert.match(source, /已接受风险数/);
  assert.match(source, /const latest = handoffs\.at\(-1\)/);
  assert.match(source, /历史研发交接仍被保留，但当前无法实时复核/);
  assert.doesNotMatch(source, /recordTaskDevelopment|freezeTaskDevelopment|decideTaskDevelopment|createTaskDevelopmentHandoff/);
  assert.doesNotMatch(source, /node:fs|YAML\.parse|YAML\.stringify|writeFileSync/);
  assert.match(styles, /\.development-axis-grid/);
  assert.match(styles, /\.development-gate-grid/);
  assert.match(styles, /\.development-planning-list/);
  assert.match(styles, /\.development-axis-grid \{ display: grid/);
  assert.match(styles, /\.development-gate-grid \{ display: grid/);
});

test('证据视图只读展示审查与验证结果，并通过智能体动作启动专业流程', () => {
  const source = read('../buildr-web/src/pages/task-detail/EvidenceTab.tsx');
  const actions = read('../buildr-web/src/app/AgentActionDrawer.tsx');
  const detail = read('../buildr-web/src/pages/TaskDetailPage.tsx');
  assert.match(source, /验证结果（Verification Result）/);
  assert.match(source, /目标适用性/);
  assert.match(source, /声明适用性/);
  assert.match(detail, /\/verification`\)/);
  assert.match(source, /openAgentAction\('task-verification', \{ taskId \}\)/);
  assert.match(actions, /\/api\/v1\/prompts\/task-verification/);
  assert.match(actions, /验证结果未被修改/);
  assert.doesNotMatch(source, /node:fs|YAML\.parse|YAML\.stringify|writeFileSync|recordTaskVerification/);
});

test('任务详情面向用户的核心术语使用中文或中英文并列', () => {
  const source = read('../buildr-web/src/pages/TaskDetailPage.tsx');
  const evidence = read('../buildr-web/src/pages/task-detail/EvidenceTab.tsx');
  const environment = read('../buildr-web/src/pages/task-detail/EnvironmentTab.tsx');
  const tasks = read('../buildr-web/src/pages/TasksPage.tsx');
  const change = read('../buildr-web/src/pages/TaskChangeDetailPage.tsx');
  assert.match(source, /任务记录（Task Record）/);
  assert.match(environment, /任务环境（Task Environment）/);
  assert.match(evidence, /方案审查（Planning Review）/);
  assert.match(evidence, /完成审查（Completion Review）/);
  assert.doesNotMatch(source, />Task Record</);
  assert.doesNotMatch(environment, />Task Environment</);
  assert.doesNotMatch(evidence, />Planning Review</);
  assert.doesNotMatch(evidence, />Completion Review</);
  assert.doesNotMatch(evidence, />Verification Result</);
  assert.match(tasks, /正式任务由 Agent 创建/);
  assert.match(tasks, /标题或意图/);
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
  const change = read('../buildr-web/src/pages/TaskChangeDetailPage.tsx');
  const tasks = read('../buildr-web/src/pages/TasksPage.tsx');
  const app = read('../buildr-web/src/App.tsx');
  assert.doesNotMatch(change, /openAgentAction|continue-change|review-change|associate-change/);
  assert.doesNotMatch(tasks, /创建任务记录|task-create-form/);
  assert.doesNotMatch(app, /path=["'][^"']*review-change/);
});

test('任务列表使用可取消的服务端筛选，详情首屏只读轻量视图并延迟读取 Parent 候选', () => {
  const detail = read('../buildr-web/src/pages/TaskDetailPage.tsx');
  const tasks = read('../buildr-web/src/pages/TasksPage.tsx');
  const server = read('src/interfaces/local-app/http/server.mjs');
  assert.match(tasks, /new AbortController\(\)/);
  assert.match(tasks, /setTimeout\([\s\S]*200/);
  assert.match(tasks, /hasChildren/);
  assert.match(tasks, /retrospectiveState/);
  assert.match(tasks, /value: 'pending', label: '未处理'/);
  assert.match(tasks, /value: 'handled', label: '已处理'/);
  assert.match(tasks, /value: 'no-action', label: '无需处理'/);
  assert.match(tasks, /useState\('open'\)/);
  assert.match(tasks, /value: 'open', label: '未结束（待办 \+ 进行中）'/);
  assert.match(tasks, /value: 'todo', label: '待办'/);
  assert.match(tasks, /childTaskCount/);
  assert.match(tasks, /totalTaskCount|还没有正式任务记录/);
  assert.doesNotMatch(tasks, /method:\s*'POST'/);
  assert.match(detail, /api\('\/api\/v1\/tasks\?status=active'\)/);
  assert.match(detail, /addEventListener\('focus'|onFocus.*loadParentOptions/);
  assert.match(detail, /打开时检查当前状态/);
  assert.doesNotMatch(detail, /Promise\.all\(\[api\('\/api\/v1\/workspace'\), api\(`\/api\/v1\/tasks\/\$\{encodeURIComponent\(taskId\)\}`\), api\('\/api\/v1\/tasks'\)\]\)/);
  assert.doesNotMatch(server, /request\.method === 'POST' && suffix === '\/tasks'/);
});
