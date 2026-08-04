function text(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function values(raw) {
  return String(raw || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
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

export async function renderTasks({ root, api, onWorkspace, navigate }) {
  root.innerHTML = `
    <section class="resource-toolbar">
      <div><p class="eyebrow">任务</p><h1>任务记录</h1><p class="page-copy">查看并管理正式任务的顶层事实。这里不展示或修改任务环境、研发、审查、验证、Git、任务收尾（Task Finish）或看板状态。</p></div>
      <span id="tasks-state" class="count-label">正在读取</span>
    </section>
    <section class="panel task-create-panel">
      <div class="panel-heading"><div><p class="eyebrow">创建</p><h2>新建正式任务</h2></div><span id="task-create-state" class="state">等待输入</span></div>
      <form id="task-create-form" class="prompt-grid">
        <label>任务 ID<input id="task-create-id" autocomplete="off" placeholder="例如 improve-login-flow" pattern="[a-z0-9](?:[a-z0-9._\\-]*[a-z0-9])?" required></label>
        <label>标题<input id="task-create-title" autocomplete="off" required></label>
        <label class="full">意图<textarea id="task-create-intent" rows="3" required></textarea></label>
        <label>项目范围（逗号或换行）<textarea id="task-create-projects" rows="3" placeholder="product"></textarea></label>
        <label>服务范围（project/service）<textarea id="task-create-services" rows="3" placeholder="product/buildr"></textarea></label>
        <label class="full">OpenSpec 变更（project/change，0..N）<textarea id="task-create-changes" rows="3" placeholder="product/introduce-task-record"></textarea></label>
        <div class="actions full"><button id="task-create-button" class="button primary" type="submit">创建任务记录</button></div>
      </form>
    </section>
    <section class="resource-list-section">
      <div class="section-heading"><div><h2>全部任务</h2><p class="section-copy">按最近更新时间排列；终态记录保持只读。</p></div></div>
      <div id="task-diagnostics" class="alert error hidden" role="status"></div>
      <div id="task-table-wrap" class="management-table-wrap hidden"><table class="management-table"><thead><tr><th>任务</th><th>意图</th><th>范围</th><th>状态</th><th>更新时间</th><th class="operation-column">操作</th></tr></thead><tbody id="task-table-body"></tbody></table></div>
      <div id="task-empty" class="empty-state hidden">当前工作空间还没有正式任务记录。只有已经对齐并准备产生持久交付的工作才需要创建。</div>
    </section>`;

  async function load() {
    const [workspace, data] = await Promise.all([api('/api/v1/workspace'), api('/api/v1/tasks')]);
    onWorkspace(workspace);
    text('tasks-state', `${data.tasks.length} 个任务`);
    const diagnostics = document.getElementById('task-diagnostics');
    diagnostics.classList.toggle('hidden', data.diagnostics.length === 0);
    diagnostics.textContent = data.diagnostics.length ? `有 ${data.diagnostics.length} 条任务记录无法读取：${data.diagnostics.map((item) => `${item.taskId}（${item.message}）`).join('；')}` : '';
    document.getElementById('task-empty').classList.toggle('hidden', data.tasks.length > 0 || data.diagnostics.length > 0);
    document.getElementById('task-table-wrap').classList.toggle('hidden', data.tasks.length === 0);
    const body = document.getElementById('task-table-body'); body.replaceChildren();
    for (const item of data.tasks) {
      const record = item.record;
      const row = document.createElement('tr');
      const identity = document.createElement('td');
      const title = document.createElement('strong'); title.textContent = record.title;
      const id = document.createElement('small'); id.textContent = record.taskId;
      identity.append(title, id);
      const intent = document.createElement('td'); intent.textContent = record.intent;
      const scope = document.createElement('td'); scope.textContent = scopeText(record);
      const status = document.createElement('td'); const badge = document.createElement('span'); badge.className = `lifecycle-badge ${record.status}`; badge.textContent = statusLabel(record.status); status.append(badge);
      const updated = document.createElement('td'); updated.textContent = new Date(record.updatedAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
      const operations = document.createElement('td'); operations.className = 'table-operations'; operations.append(detailLink(record.taskId));
      row.append(identity, intent, scope, status, updated, operations); body.append(row);
    }
  }

  try { await load(); } catch (error) { text('tasks-state', '读取失败'); text('task-empty', error.message); document.getElementById('task-empty').classList.remove('hidden'); }

  document.getElementById('task-create-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.getElementById('task-create-button'); button.disabled = true; text('task-create-state', '正在创建…');
    try {
      const created = await api('/api/v1/tasks', { method: 'POST', body: JSON.stringify({
        taskId: document.getElementById('task-create-id').value.trim(),
        title: document.getElementById('task-create-title').value,
        intent: document.getElementById('task-create-intent').value,
        projects: values(document.getElementById('task-create-projects').value),
        services: values(document.getElementById('task-create-services').value),
        changes: values(document.getElementById('task-create-changes').value),
      }) });
      text('task-create-state', '创建成功');
      await navigate(`/tasks/${encodeURIComponent(created.taskId)}`);
    } catch (error) {
      text('task-create-state', error.message); button.disabled = false;
    }
  });
}
