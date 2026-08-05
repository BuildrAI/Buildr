function text(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function statusLabel(status) {
  return status === 'active' ? '进行中' : status === 'completed' ? '已完成' : status === 'abandoned' ? '已放弃' : status;
}

function scopeText(record) {
  const projects = record.scope.projects.join('、') || '无项目';
  const services = record.scope.services.map((item) => `${item.project}/${item.service}`).join('、');
  return services ? `${projects}；${services}` : projects;
}

function detailLink(taskId) {
  const link = document.createElement('a');
  link.className = 'table-action';
  link.href = `/tasks/${encodeURIComponent(taskId)}`;
  link.dataset.route = '';
  link.textContent = '详情';
  return link;
}

function replaceOptions(select, values, label, selected, value = (item) => item, name = (item) => item) {
  select.replaceChildren(new Option(label, ''));
  for (const item of values) select.append(new Option(name(item), value(item)));
  select.value = selected;
}

export async function renderTasks({ root, api, onWorkspace }) {
  root.innerHTML = `
    <section class="resource-toolbar">
      <div><p class="eyebrow">任务</p><h1>任务记录</h1><p class="page-copy">查看正式任务的顶层事实并进行有限维护。正式任务由 Agent 创建，Local App 不提供创建入口。</p></div>
      <span id="tasks-state" class="count-label">正在读取</span>
    </section>
    <section class="panel task-filter-panel">
      <div class="panel-heading"><div><p class="eyebrow">筛选</p><h2>缩小任务范围</h2></div><button id="task-filter-clear" class="button secondary" type="button">清除筛选</button></div>
      <form id="task-filter-form" class="task-filter-grid">
        <label class="task-filter-query">标题或意图<input id="task-filter-q" type="search" autocomplete="off" placeholder="输入关键词"></label>
        <label>状态<select id="task-filter-status"><option value="active">进行中</option><option value="completed">已完成</option><option value="abandoned">已放弃</option><option value="all">全部</option></select></label>
        <label>项目<select id="task-filter-project"><option value="">全部项目</option></select></label>
        <label>服务<select id="task-filter-service"><option value="">全部服务</option></select></label>
        <label>Child Task<select id="task-filter-children"><option value="all">不限</option><option value="yes">有直接 Child</option><option value="no">无直接 Child</option></select></label>
      </form>
    </section>
    <section class="resource-list-section">
      <div class="section-heading"><div><h2>任务</h2><p class="section-copy">默认只显示进行中的任务，按最近更新时间排列。</p></div></div>
      <div id="task-diagnostics" class="alert error hidden" role="status"></div>
      <div id="task-table-wrap" class="management-table-wrap hidden"><table class="management-table"><thead><tr><th>任务</th><th>意图</th><th>层级</th><th>范围</th><th>状态</th><th>更新时间</th><th class="operation-column">操作</th></tr></thead><tbody id="task-table-body"></tbody></table></div>
      <div id="task-empty" class="empty-state hidden"></div>
    </section>`;

  let requestGeneration = 0;
  let activeRequest = null;
  let workspaceLoaded = false;
  let searchTimer = null;

  function queryString() {
    const query = new URLSearchParams();
    const values = {
      q: document.getElementById('task-filter-q').value.trim(),
      project: document.getElementById('task-filter-project').value,
      service: document.getElementById('task-filter-service').value,
      status: document.getElementById('task-filter-status').value,
      hasChildren: document.getElementById('task-filter-children').value,
    };
    for (const [key, value] of Object.entries(values)) if (value && value !== 'all') query.set(key, value);
    return query.toString();
  }

  function renderFilterOptions(data) {
    const project = document.getElementById('task-filter-project');
    const service = document.getElementById('task-filter-service');
    const selectedProject = project.value;
    const selectedService = service.value;
    replaceOptions(project, data.filterOptions.projects, '全部项目', selectedProject);
    const services = selectedProject ? data.filterOptions.services.filter((item) => item.startsWith(`${selectedProject}/`)) : data.filterOptions.services;
    replaceOptions(service, services, '全部服务', selectedService);
  }

  function render(data) {
    renderFilterOptions(data);
    text('tasks-state', `${data.tasks.length} 个任务`);
    const diagnostics = document.getElementById('task-diagnostics');
    diagnostics.classList.toggle('hidden', data.diagnostics.length === 0);
    diagnostics.textContent = data.diagnostics.length ? `有 ${data.diagnostics.length} 条诊断：${data.diagnostics.map((item) => item.message).join('；')}` : '';
    document.getElementById('task-table-wrap').classList.toggle('hidden', data.tasks.length === 0);
    const empty = document.getElementById('task-empty');
    empty.classList.toggle('hidden', data.tasks.length > 0 || data.diagnostics.length > 0);
    empty.textContent = data.totalTaskCount === 0 ? '当前工作空间还没有正式任务记录。正式任务由 Agent 创建。' : '没有符合当前筛选条件的任务。';
    const body = document.getElementById('task-table-body'); body.replaceChildren();
    for (const item of data.tasks) {
      const record = item.record;
      const row = document.createElement('tr');
      const identity = document.createElement('td');
      const title = document.createElement('strong'); title.textContent = record.title;
      const id = document.createElement('small'); id.textContent = record.taskId;
      identity.append(title, id);
      const intent = document.createElement('td'); intent.textContent = record.intent;
      const hierarchy = document.createElement('td');
      const parent = document.createElement('div'); parent.textContent = item.taskRelations.parent ? `Parent：${item.taskRelations.parent.taskId}` : 'Parent：无';
      const children = document.createElement('small'); children.textContent = `直接 Child：${item.childTaskCount}`;
      hierarchy.append(parent, children);
      const scope = document.createElement('td'); scope.textContent = scopeText(record);
      const status = document.createElement('td'); const badge = document.createElement('span'); badge.className = `lifecycle-badge ${record.status}`; badge.textContent = statusLabel(record.status); status.append(badge);
      const updated = document.createElement('td'); updated.textContent = new Date(record.updatedAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
      const operations = document.createElement('td'); operations.className = 'table-operations'; operations.append(detailLink(record.taskId));
      row.append(identity, intent, hierarchy, scope, status, updated, operations); body.append(row);
    }
  }

  async function load() {
    const generation = ++requestGeneration;
    activeRequest?.abort();
    activeRequest = new AbortController();
    text('tasks-state', '正在读取…');
    document.getElementById('task-filter-form').classList.add('is-loading');
    try {
      const requests = [api(`/api/v1/tasks${queryString() ? `?${queryString()}` : ''}`, { signal: activeRequest.signal })];
      if (!workspaceLoaded) requests.push(api('/api/v1/workspace', { signal: activeRequest.signal }));
      const [data, workspace] = await Promise.all(requests);
      if (generation !== requestGeneration) return;
      if (workspace) { onWorkspace(workspace); workspaceLoaded = true; }
      render(data);
    } catch (error) {
      if (error.name === 'AbortError' || generation !== requestGeneration) return;
      text('tasks-state', '读取失败');
      const empty = document.getElementById('task-empty'); empty.textContent = error.message; empty.classList.remove('hidden');
      document.getElementById('task-table-wrap').classList.add('hidden');
    } finally {
      if (generation === requestGeneration) document.getElementById('task-filter-form').classList.remove('is-loading');
    }
  }

  document.getElementById('task-filter-form').addEventListener('submit', (event) => event.preventDefault());
  document.getElementById('task-filter-q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 200); });
  for (const id of ['task-filter-status', 'task-filter-service', 'task-filter-children']) document.getElementById(id).addEventListener('change', load);
  document.getElementById('task-filter-project').addEventListener('change', () => { document.getElementById('task-filter-service').value = ''; load(); });
  document.getElementById('task-filter-clear').addEventListener('click', () => {
    document.getElementById('task-filter-q').value = '';
    document.getElementById('task-filter-project').value = '';
    document.getElementById('task-filter-service').value = '';
    document.getElementById('task-filter-status').value = 'active';
    document.getElementById('task-filter-children').value = 'all';
    load();
  });

  await load();
}
