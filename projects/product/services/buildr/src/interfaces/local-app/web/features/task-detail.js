function text(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function lines(values, secondField = null) {
  return values.map((item) => secondField ? `${item.project}/${item[secondField]}` : item).join('\n');
}

function parseLines(raw) {
  return String(raw || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function qualified(value, secondField) {
  const [project, identity, ...rest] = value.split('/');
  return rest.length || !project || !identity ? value : { project, [secondField]: identity };
}

function diff(current, next, key = (item) => typeof item === 'string' ? item : JSON.stringify(item)) {
  const currentKeys = new Set(current.map(key));
  const nextKeys = new Set(next.map(key));
  return {
    add: next.filter((item) => !currentKeys.has(key(item))),
    remove: current.filter((item) => !nextKeys.has(key(item))),
  };
}

function statusLabel(status) {
  return status === 'active' ? '进行中' : status === 'completed' ? '已完成' : '已放弃';
}

function errorPage(root, message) {
  root.innerHTML = '<section class="page-header"><p class="eyebrow">任务</p><h1>任务不可用</h1><p class="page-copy"></p></section><a class="button secondary" href="/tasks" data-route>返回任务列表</a>';
  root.querySelector('.page-copy').textContent = message;
}

export async function renderTaskDetail({ root, api, onWorkspace, onBreadcrumb, navigate, params }) {
  const taskId = params.taskId;
  root.innerHTML = `
    <section class="detail-page-header"><a class="back-link" href="/tasks" data-route>← 返回任务列表</a><div class="detail-title-row"><div><p class="eyebrow">任务</p><h1 id="task-detail-title">正在读取…</h1><p id="task-detail-intent" class="page-copy"></p></div><span id="task-detail-status" class="lifecycle-badge">—</span></div></section>
    <div id="task-detail-alert" class="alert hidden" role="status"></div>
    <section class="detail-layout">
      <article class="panel"><div class="panel-heading"><div><h2>Task Record</h2><p class="section-copy">只展示顶层任务事实，不推断专业阶段状态。</p></div></div><dl class="read-facts detail-facts"><div><dt>Task ID</dt><dd id="task-detail-id">—</dd></div><div><dt>Project scope</dt><dd id="task-detail-projects">—</dd></div><div><dt>Service scope</dt><dd id="task-detail-services">—</dd></div><div><dt>OpenSpec Changes</dt><dd id="task-detail-changes">—</dd></div><div><dt>结果</dt><dd id="task-detail-result">进行中</dd></div><div><dt>创建时间</dt><dd id="task-detail-created">—</dd></div><div><dt>更新时间</dt><dd id="task-detail-updated">—</dd></div></dl></article>
      <aside class="panel facts-panel"><p class="eyebrow">技术事实</p><h2>读取证据</h2><dl class="fact-list"><div><dt>数据格式</dt><dd>buildr.task-record/v1</dd></div><div><dt>canonical path</dt><dd id="task-detail-path">—</dd></div><div><dt>recordDigest</dt><dd id="task-detail-digest">—</dd></div></dl></aside>
    </section>
    <section id="task-active-actions" class="task-actions">
      <article class="panel"><div class="panel-heading"><div><h2>编辑 active Task</h2><p class="section-copy">保存时只提交明确 setter 与 add/remove 操作；陈旧页面不会覆盖新内容。</p></div><span id="task-edit-state" class="state">可以修改</span></div><form id="task-edit-form" class="prompt-grid"><label>标题<input id="task-edit-title" required></label><label class="full">意图<textarea id="task-edit-intent" rows="3" required></textarea></label><label>Project scope<textarea id="task-edit-projects" rows="3"></textarea></label><label>Service scope（project/service）<textarea id="task-edit-services" rows="3"></textarea></label><label class="full">OpenSpec Changes（project/change）<textarea id="task-edit-changes" rows="3"></textarea></label><div class="actions full"><button id="task-edit-button" class="button primary" type="submit">保存 Task Record</button></div></form></article>
      <article class="panel terminal-panel"><div class="panel-heading"><div><h2>结束 Task</h2><p class="section-copy">只更新顶层状态；不会执行 Finish、Git、Verification、Environment cleanup 或其他专业动作。</p></div></div><div class="terminal-action-grid"><form id="task-complete-form"><h3>完成</h3><label>完成摘要<textarea id="task-complete-summary" rows="3" required></textarea></label><label>是否无需交付变更<select id="task-complete-no-change" required><option value="">请选择</option><option value="false">有交付变更</option><option value="true">确认无需变更</option></select></label><button class="button secondary" type="submit">确认完成</button></form><form id="task-abandon-form"><h3>放弃</h3><label>放弃原因<textarea id="task-abandon-reason" rows="3" required></textarea></label><button class="button danger" type="submit">确认放弃</button></form></div></article>
    </section>
    <section id="task-terminal-note" class="empty-state hidden"><h2>这是终态 Task Record</h2><p>顶层事实保持只读，不提供重开或继续修改入口。专业模块仍由各自 authority 管理。</p></section>`;

  let current;
  function render(data) {
    current = data;
    const record = data.record;
    onBreadcrumb(['任务', record.title]);
    text('task-detail-title', record.title); text('task-detail-intent', record.intent); text('task-detail-id', record.taskId);
    text('task-detail-status', statusLabel(record.status)); document.getElementById('task-detail-status').className = `lifecycle-badge ${record.status}`;
    text('task-detail-projects', record.scope.projects.join('、') || '无'); text('task-detail-services', lines(record.scope.services, 'service').replaceAll('\n', '、') || '无'); text('task-detail-changes', lines(record.changes, 'change').replaceAll('\n', '、') || '无');
    text('task-detail-result', record.result ? `${record.result.summary}${record.status === 'completed' ? `（${record.result.noChange ? '无需变更' : '有交付变更'}）` : ''}` : '进行中');
    text('task-detail-created', new Date(record.createdAt).toLocaleString('zh-CN')); text('task-detail-updated', new Date(record.updatedAt).toLocaleString('zh-CN')); text('task-detail-path', data.path); text('task-detail-digest', data.recordDigest);
    document.getElementById('task-edit-title').value = record.title; document.getElementById('task-edit-intent').value = record.intent; document.getElementById('task-edit-projects').value = lines(record.scope.projects); document.getElementById('task-edit-services').value = lines(record.scope.services, 'service'); document.getElementById('task-edit-changes').value = lines(record.changes, 'change');
    const terminal = record.status !== 'active'; document.getElementById('task-active-actions').classList.toggle('hidden', terminal); document.getElementById('task-terminal-note').classList.toggle('hidden', !terminal);
  }

  async function refresh() {
    const [workspace, data] = await Promise.all([api('/api/v1/workspace'), api(`/api/v1/tasks/${encodeURIComponent(taskId)}`)]); onWorkspace(workspace); render(data);
  }

  function showError(error) {
    const alert = document.getElementById('task-detail-alert'); alert.classList.remove('hidden'); alert.classList.toggle('error', error.code !== 'task_record_conflict'); alert.textContent = error.code === 'task_record_conflict' ? `${error.message} 请刷新本页。` : error.message;
    text('task-edit-state', error.code === 'task_record_conflict' ? '记录已变化' : '保存失败');
  }

  try { await refresh(); } catch (error) { errorPage(root, error.message); return; }

  document.getElementById('task-edit-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const button = document.getElementById('task-edit-button'); button.disabled = true; text('task-edit-state', '正在保存…');
    const record = current.record;
    const nextProjects = parseLines(document.getElementById('task-edit-projects').value);
    const nextServices = parseLines(document.getElementById('task-edit-services').value).map((item) => qualified(item, 'service'));
    const nextChanges = parseLines(document.getElementById('task-edit-changes').value).map((item) => qualified(item, 'change'));
    const projects = diff(record.scope.projects, nextProjects);
    const services = diff(record.scope.services, nextServices, (item) => typeof item === 'string' ? item : `${item.project}/${item.service}`);
    const changes = diff(record.changes, nextChanges, (item) => typeof item === 'string' ? item : `${item.project}/${item.change}`);
    try {
      const updated = await api(`/api/v1/tasks/${encodeURIComponent(taskId)}`, { method: 'PATCH', body: JSON.stringify({ expectedRecordDigest: current.recordDigest, title: document.getElementById('task-edit-title').value, intent: document.getElementById('task-edit-intent').value, addProjects: projects.add, removeProjects: projects.remove, addServices: services.add, removeServices: services.remove, addChanges: changes.add, removeChanges: changes.remove }) });
      render(updated); text('task-edit-state', updated.effects.length ? '保存成功' : '内容一致'); button.disabled = false; document.getElementById('task-detail-alert').classList.add('hidden');
    } catch (error) { showError(error); button.disabled = false; }
  });

  document.getElementById('task-complete-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const selection = document.getElementById('task-complete-no-change').value; if (!selection) return;
    if (!window.confirm('确认只把顶层 Task Record 标记为完成？这不会执行 Finish、Git、Verification 或 Environment cleanup。')) return;
    try { await api(`/api/v1/tasks/${encodeURIComponent(taskId)}/complete`, { method: 'POST', body: JSON.stringify({ expectedRecordDigest: current.recordDigest, summary: document.getElementById('task-complete-summary').value, noChange: selection === 'true' }) }); await navigate(`/tasks/${encodeURIComponent(taskId)}`); } catch (error) { showError(error); }
  });

  document.getElementById('task-abandon-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (!window.confirm('确认只把顶层 Task Record 标记为放弃？这不会清理 Environment、执行 Git 或其他专业动作。')) return;
    try { await api(`/api/v1/tasks/${encodeURIComponent(taskId)}/abandon`, { method: 'POST', body: JSON.stringify({ expectedRecordDigest: current.recordDigest, reason: document.getElementById('task-abandon-reason').value }) }); await navigate(`/tasks/${encodeURIComponent(taskId)}`); } catch (error) { showError(error); }
  });
}
