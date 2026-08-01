import { api, setWorkspaceId } from '/api-client.js';
import { setupAgentActions } from '/features/agent-actions.js';
import { renderProjectDetail } from '/features/project-detail.js';
import { renderProjectEdit } from '/features/project-edit.js';
import { renderProjects } from '/features/projects.js';
import { renderServices } from '/features/services.js';
import { renderServiceDetail } from '/features/service-detail.js';
import { renderServiceEdit } from '/features/service-edit.js';
import { renderChanges } from '/features/changes.js';
import { renderChangeDetail } from '/features/change-detail.js';
import { renderWorkspaceOverview, renderWorkspaceSettings } from '/features/workspace.js';
import { renderWorkspaces } from '/features/workspaces.js';
import { renderTasks } from '/features/tasks.js';
import { renderTaskDetail } from '/features/task-detail.js';
import { createRouter } from '/router.js';

const view = document.getElementById('app-view');
let currentWorkspaceId = null;
let currentWorkspaceName = '工作空间';

function previewIdentity() {
  const raw = document.querySelector('meta[name="buildr-preview"]')?.content;
  if (!raw) return null;
  try { return JSON.parse(decodeURIComponent(raw)); } catch { return null; }
}

function renderPreviewIdentity() {
  const identity = previewIdentity();
  const element = document.getElementById('preview-identity');
  if (!identity) return;
  element.classList.remove('hidden');
  element.textContent = `开发预览：${identity.instance} · ${identity.branch} · ${identity.head.slice(0, 12)}${identity.dirty ? ' · 有未提交修改' : ''}`;
  element.title = identity.worktree;
}

const routeDefinitions = {
  '/': { id: 'workspaces', label: '工作空间', render: renderWorkspaces, global: true },
  '/overview': { id: 'overview', label: '开始', render: renderWorkspaceOverview },
  '/settings': { id: 'settings', label: '工作空间设置', render: renderWorkspaceSettings },
  '/tasks': { id: 'tasks', label: '任务', render: renderTasks },
  '/tasks/:taskId': {
    id: 'tasks', label: '任务详情',
    match(pathname) {
      const match = pathname.match(/^\/tasks\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)$/);
      return match ? { taskId: decodeURIComponent(match[1]) } : null;
    },
    render: renderTaskDetail,
  },
  '/tasks/:taskId/changes/:projectCode/:changeCode': {
    id: 'tasks', label: '任务关联变更',
    match(pathname) {
      const match = pathname.match(/^\/tasks\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\/changes\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)$/);
      return match ? { taskId: decodeURIComponent(match[1]), projectCode: decodeURIComponent(match[2]), changeCode: decodeURIComponent(match[3]) } : null;
    },
    render: renderChangeDetail,
  },
  '/projects': { id: 'projects', label: '项目', render: renderProjects },
  '/projects/:projectCode': {
    id: 'projects', label: '项目详情',
    match(pathname) {
      const match = pathname.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9._-]*)$/);
      return match ? { projectCode: decodeURIComponent(match[1]) } : null;
    },
    render: renderProjectDetail,
  },
  '/projects/:projectCode/edit': {
    id: 'projects', label: '编辑项目',
    match(pathname) {
      const match = pathname.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9._-]*)\/edit$/);
      return match ? { projectCode: decodeURIComponent(match[1]) } : null;
    },
    render: renderProjectEdit,
  },
  '/services': { id: 'services', label: '服务', render: renderServices },
  '/services/:projectCode/:serviceCode': {
    id: 'services', label: '服务详情',
    match(pathname) {
      const match = pathname.match(/^\/services\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/);
      return match ? { projectCode: decodeURIComponent(match[1]), serviceCode: decodeURIComponent(match[2]) } : null;
    },
    render: renderServiceDetail,
  },
  '/services/:projectCode/:serviceCode/edit': {
    id: 'services', label: '编辑服务',
    match(pathname) {
      const match = pathname.match(/^\/services\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)\/edit$/);
      return match ? { projectCode: decodeURIComponent(match[1]), serviceCode: decodeURIComponent(match[2]) } : null;
    },
    render: renderServiceEdit,
  },
  '/changes': { id: 'changes', label: '变更', render: renderChanges },
  '/changes/:projectCode/:changeRef': {
    id: 'changes', label: '变更详情',
    match(pathname) {
      const match = pathname.match(/^\/changes\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([^/]+)$/);
      return match ? { projectCode: decodeURIComponent(match[1]), changeRef: decodeURIComponent(match[2]) } : null;
    },
    render: renderChangeDetail,
  },
};

function routeContext(pathname) {
  const match = pathname.match(/^\/workspaces\/([0-9a-fA-F-]{36})(\/.*)?$/);
  if (!match) return { workspaceId: null, pathname: '/' };
  const suffix = match[2] || '/';
  return { workspaceId: match[1], pathname: suffix === '/' ? '/overview' : suffix };
}

function updateWorkspaceContext(data) {
  currentWorkspaceName = data.workspace.name;
  document.getElementById('shell-workspace-name').textContent = data.workspace.name;
  document.getElementById('shell-workspace-path').textContent = data.rootPath;
  document.title = `${data.workspace.name} · Buildr`;
}

function setWorkspaceShell(global) {
  document.body.classList.toggle('global-context', global);
  if (global) {
    document.getElementById('shell-workspace-name').textContent = '全部工作空间';
    document.getElementById('shell-workspace-path').textContent = '本机登记列表';
    document.title = 'Buildr 工作空间';
  }
  for (const link of document.querySelectorAll('[data-workspace-route]')) {
    const suffix = link.dataset.workspaceRoute;
    link.href = currentWorkspaceId ? `/workspaces/${currentWorkspaceId}${suffix}` : '/';
  }
}

function updateRouteState(route, global) {
  updateBreadcrumb(global ? ['工作空间'] : [currentWorkspaceName, route.label]);
  for (const item of document.querySelectorAll('[data-nav]')) {
    const active = item.dataset.nav === route.id;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  const resourceGroup = document.querySelector('[data-nav-group="resources"]');
  resourceGroup.classList.toggle('active', ['tasks', 'projects', 'services'].includes(route.id));
  const moreGroup = document.querySelector('[data-nav-group="more"]');
  moreGroup.classList.toggle('active', route.id === 'changes');
}

function updateBreadcrumb(parts) {
  const breadcrumb = document.getElementById('page-breadcrumb');
  breadcrumb.replaceChildren();
  parts.forEach((part, index) => {
    const item = document.createElement(index === parts.length - 1 ? 'strong' : 'span');
    item.textContent = part;
    breadcrumb.append(item);
  });
}

function setResourceNavigation(expanded) {
  const toggle = document.getElementById('resource-nav-toggle');
  const children = document.getElementById('resource-nav-children');
  toggle.setAttribute('aria-expanded', String(expanded));
  children.classList.toggle('collapsed', !expanded);
  toggle.querySelector('.nav-chevron').textContent = expanded ? '⌄' : '›';
}

function workspaceDestination(destination) {
  if (!currentWorkspaceId || destination === '/' || destination.startsWith('/workspaces/')) return destination;
  const internal = ['/overview', '/settings', '/tasks', '/projects', '/services', '/changes'];
  return internal.some((prefix) => destination === prefix || destination.startsWith(`${prefix}/`) || destination.startsWith(`${prefix}?`))
    ? `/workspaces/${currentWorkspaceId}${destination}`
    : destination;
}

const router = createRouter({
  routes: routeDefinitions,
  workspaceDestination,
  async onRoute(_route, browserPath) {
    const context = routeContext(browserPath);
    currentWorkspaceId = context.workspaceId;
    setWorkspaceId(currentWorkspaceId);
    const route = router.resolve ? router.resolve(context.pathname) : null;
    const resolved = route || (context.workspaceId ? routeDefinitions['/overview'] : routeDefinitions['/']);
    setWorkspaceShell(!context.workspaceId);
    updateRouteState(resolved, !context.workspaceId);
    view.innerHTML = '<div class="page-loading"><span class="loader"></span><p>正在读取真实信息…</p></div>';
    await resolved.render({
      root: view,
      api,
      onWorkspace: updateWorkspaceContext,
      onBreadcrumb: (parts) => updateBreadcrumb([currentWorkspaceName, ...parts]),
      navigate: router.navigate,
      openAgentAction: agentActions.open,
      params: resolved.params || {},
    });
    view.focus({ preventScroll: true });
  },
});

const originalResolve = (() => {
  function resolve(pathname) {
    if (routeDefinitions[pathname]) return { ...routeDefinitions[pathname], params: {} };
    for (const route of Object.values(routeDefinitions)) {
      const params = route.match?.(pathname);
      if (params) return { ...route, params };
    }
    return currentWorkspaceId ? { ...routeDefinitions['/overview'], params: {} } : { ...routeDefinitions['/'], params: {} };
  }
  return resolve;
})();
router.resolve = originalResolve;

const agentActions = setupAgentActions({ api });
renderPreviewIdentity();
document.getElementById('resource-nav-toggle').addEventListener('click', () => {
  const expanded = document.getElementById('resource-nav-toggle').getAttribute('aria-expanded') === 'true';
  setResourceNavigation(!expanded);
});
document.getElementById('quit-buildr').addEventListener('click', async () => {
  if (!window.confirm('退出 Buildr 后，本机服务将停止。确定退出吗？')) return;
  await api('/api/v1/app/quit', { method: 'POST', body: '{}' });
  view.innerHTML = '<section class="empty-state"><h1>Buildr 已退出</h1><p>你可以关闭此页面；再次点击 Buildr 图标即可重新打开。</p></section>';
});
setResourceNavigation(window.matchMedia('(min-width: 701px)').matches);
router.start();
