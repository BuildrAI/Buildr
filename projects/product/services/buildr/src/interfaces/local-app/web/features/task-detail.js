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

function environmentStatusLabel(status) {
  return ({ ready: '可执行', blocked: '受阻', unavailable: '当前机器不可用', cleaned: '已清理' })[status] || status || '未知';
}

function probeStatusLabel(status) {
  return ({ ready: '就绪', blocked: '受阻', 'not-applicable': '不适用' })[status] || status || '未知';
}

function provenanceLabel(resolution) {
  if (resolution.availability !== 'available') return '当前不可用';
  const provenance = resolution.workingCopy?.provenance;
  if (provenance === 'task-environment-candidate') return `任务环境候选 · ${resolution.workingCopy.change.lifecycle === 'archived' ? '已归档' : '进行中'}`;
  if (provenance === 'retained-archive') return 'Retained · 已归档';
  return 'Retained · 进行中';
}

function fact(label, value) {
  const row = document.createElement('div');
  const term = document.createElement('dt'); term.textContent = label;
  const description = document.createElement('dd'); description.textContent = value;
  row.append(term, description);
  return row;
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
    <nav class="detail-tabs" aria-label="任务详情"><button class="detail-tab active" type="button" data-task-tab="overview" aria-selected="true">概览</button><button class="detail-tab" type="button" data-task-tab="environment" aria-selected="false">环境</button></nav>
    <div id="task-overview-panel" data-task-panel="overview">
    <section class="detail-layout">
      <article class="panel"><div class="panel-heading"><div><h2>Task Record</h2><p class="section-copy">只展示顶层任务事实，不推断专业阶段状态。</p></div></div><dl class="read-facts detail-facts"><div><dt>Task ID</dt><dd id="task-detail-id">—</dd></div><div><dt>Project scope</dt><dd id="task-detail-projects">—</dd></div><div><dt>Service scope</dt><dd id="task-detail-services">—</dd></div><div><dt>OpenSpec Changes</dt><dd id="task-detail-changes">—</dd></div><div><dt>结果</dt><dd id="task-detail-result">进行中</dd></div><div><dt>创建时间</dt><dd id="task-detail-created">—</dd></div><div><dt>更新时间</dt><dd id="task-detail-updated">—</dd></div></dl></article>
      <aside class="panel facts-panel"><p class="eyebrow">技术事实</p><h2>读取证据</h2><dl class="fact-list"><div><dt>数据格式</dt><dd>buildr.task-record/v1</dd></div><div><dt>canonical path</dt><dd id="task-detail-path">—</dd></div><div><dt>recordDigest</dt><dd id="task-detail-digest">—</dd></div></dl></aside>
    </section>
    <section id="task-active-actions" class="task-actions">
      <article class="panel"><div class="panel-heading"><div><h2>编辑 active Task</h2><p class="section-copy">保存时只提交明确 setter 与 add/remove 操作；陈旧页面不会覆盖新内容。</p></div><span id="task-edit-state" class="state">可以修改</span></div><form id="task-edit-form" class="prompt-grid"><label>标题<input id="task-edit-title" required></label><label class="full">意图<textarea id="task-edit-intent" rows="3" required></textarea></label><label>Project scope<textarea id="task-edit-projects" rows="3"></textarea></label><label>Service scope（project/service）<textarea id="task-edit-services" rows="3"></textarea></label><label class="full">OpenSpec Changes（project/change）<textarea id="task-edit-changes" rows="3"></textarea></label><div class="actions full"><button id="task-edit-button" class="button primary" type="submit">保存 Task Record</button></div></form></article>
      <article class="panel terminal-panel"><div class="panel-heading"><div><h2>结束 Task</h2><p class="section-copy">只更新顶层状态；不会执行 Finish、Git、Verification、Environment cleanup 或其他专业动作。</p></div></div><div class="terminal-action-grid"><form id="task-complete-form"><h3>完成</h3><label>完成摘要<textarea id="task-complete-summary" rows="3" required></textarea></label><label>是否无需交付变更<select id="task-complete-no-change" required><option value="">请选择</option><option value="false">有交付变更</option><option value="true">确认无需变更</option></select></label><button class="button secondary" type="submit">确认完成</button></form><form id="task-abandon-form"><h3>放弃</h3><label>放弃原因<textarea id="task-abandon-reason" rows="3" required></textarea></label><button class="button danger" type="submit">确认放弃</button></form></div></article>
    </section>
    <section id="task-terminal-note" class="empty-state hidden"><h2>这是终态 Task Record</h2><p>顶层事实保持只读，不提供重开或继续修改入口。专业模块仍由各自 authority 管理。</p></section>
    </div>
    <section id="task-environment-panel" class="hidden" data-task-panel="environment" aria-live="polite">
      <article class="panel environment-summary"><div class="panel-heading"><div><p class="eyebrow">当前机器事实</p><h2>Task Environment</h2><p class="section-copy">只读探测当前环境；不会准备、恢复或清理任何资源。</p></div><button id="task-environment-refresh" class="button secondary" type="button">刷新当前事实</button></div><dl class="read-facts"><div><dt>状态</dt><dd id="task-environment-status">尚未读取</dd></div><div><dt>观察时间</dt><dd id="task-environment-observed">—</dd></div><div><dt>来源</dt><dd id="task-environment-source">current-machine</dd></div><div><dt>Environment Receipt</dt><dd id="task-environment-receipt">—</dd></div></dl><div id="task-environment-diagnostic" class="environment-diagnostic hidden"></div></article>
      <div id="task-environment-loading" class="page-loading hidden"><span class="loader"></span><p>正在探测当前环境…</p></div>
      <div id="task-environment-detail" class="environment-detail hidden"><section class="panel"><div class="panel-heading"><div><h2>工作范围与执行基础</h2><p class="section-copy">每个 scope 展示真实执行根、任务验证工作区根与最小 probe。</p></div></div><div id="task-environment-scopes" class="environment-scope-list"></div></section><section class="detail-layout"><article class="panel"><div class="panel-heading"><div><h2>动态资源</h2><p class="section-copy">只展示 Environment Application 返回的非敏感事实。</p></div></div><div id="task-environment-resources"></div></article><aside class="panel facts-panel"><p class="eyebrow">处置事实</p><h2>Cleanup</h2><dl id="task-environment-cleanup" class="fact-list"></dl></aside></section></div>
    </section>`;

  let current;
  function render(data) {
    current = data;
    const record = data.record;
    onBreadcrumb(['任务', record.title]);
    text('task-detail-title', record.title); text('task-detail-intent', record.intent); text('task-detail-id', record.taskId);
    text('task-detail-status', statusLabel(record.status)); document.getElementById('task-detail-status').className = `lifecycle-badge ${record.status}`;
    text('task-detail-projects', record.scope.projects.join('、') || '无'); text('task-detail-services', lines(record.scope.services, 'service').replaceAll('\n', '、') || '无');
    const changeContainer = document.getElementById('task-detail-changes'); changeContainer.replaceChildren();
    if (!record.changes.length) changeContainer.textContent = '无';
    else {
      const resolutions = new Map((data.changeReferences || []).map((item) => [`${item.reference.project}/${item.reference.change}`, item]));
      const list = document.createElement('span'); list.className = 'task-change-links';
      for (const reference of record.changes) {
        const key = `${reference.project}/${reference.change}`;
        const resolution = resolutions.get(key) || { availability: 'unavailable' };
        const item = document.createElement(resolution.availability === 'available' ? 'a' : 'span');
        item.className = `task-change-link ${resolution.availability}`;
        if (item.tagName === 'A') { item.href = `/tasks/${encodeURIComponent(taskId)}/changes/${encodeURIComponent(reference.project)}/${encodeURIComponent(reference.change)}`; item.dataset.route = ''; }
        const label = document.createElement('strong'); label.textContent = key;
        const provenance = document.createElement('small'); provenance.textContent = provenanceLabel(resolution);
        item.append(label, provenance); list.append(item);
      }
      changeContainer.append(list);
    }
    text('task-detail-result', record.result ? `${record.result.summary}${record.status === 'completed' ? `（${record.result.noChange ? '无需变更' : '有交付变更'}）` : ''}` : '进行中');
    text('task-detail-created', new Date(record.createdAt).toLocaleString('zh-CN')); text('task-detail-updated', new Date(record.updatedAt).toLocaleString('zh-CN')); text('task-detail-path', data.path); text('task-detail-digest', data.recordDigest);
    document.getElementById('task-edit-title').value = record.title; document.getElementById('task-edit-intent').value = record.intent; document.getElementById('task-edit-projects').value = lines(record.scope.projects); document.getElementById('task-edit-services').value = lines(record.scope.services, 'service'); document.getElementById('task-edit-changes').value = lines(record.changes, 'change');
    const terminal = record.status !== 'active'; document.getElementById('task-active-actions').classList.toggle('hidden', terminal); document.getElementById('task-terminal-note').classList.toggle('hidden', !terminal);
  }

  const environmentPanel = document.getElementById('task-environment-panel');
  let activeTab = 'overview';
  let environmentLoading = false;

  function renderEnvironment(data) {
    if (!environmentPanel.isConnected) return;
    text('task-environment-status', environmentStatusLabel(data.status));
    text('task-environment-observed', data.observedAt ? new Date(data.observedAt).toLocaleString('zh-CN') : '—');
    text('task-environment-source', data.source || 'current-machine');
    text('task-environment-receipt', `${data.receipt?.available ? '可用' : '不可用'} · ${data.receipt?.path || '—'}`);
    const diagnostic = document.getElementById('task-environment-diagnostic'); diagnostic.replaceChildren();
    if (data.diagnostic || data.nextActions?.length) {
      diagnostic.classList.remove('hidden');
      if (data.diagnostic) {
        const message = document.createElement('p'); message.textContent = `${data.diagnostic.code || 'diagnostic'}：${data.diagnostic.message}`; diagnostic.append(message);
      }
      if (data.nextActions?.length) {
        const actions = document.createElement('ul');
        for (const value of data.nextActions) { const item = document.createElement('li'); item.textContent = value; actions.append(item); }
        diagnostic.append(actions);
      }
    } else diagnostic.classList.add('hidden');

    const detail = document.getElementById('task-environment-detail');
    if (!data.environment) { detail.classList.add('hidden'); return; }
    detail.classList.remove('hidden');
    const scopes = document.getElementById('task-environment-scopes'); scopes.replaceChildren();
    const controller = data.environment.controller;
    const controllerCard = document.createElement('article'); controllerCard.className = 'environment-scope-card controller-card';
    const controllerHeading = document.createElement('div'); controllerHeading.className = 'environment-scope-heading';
    const controllerTitle = document.createElement('h3'); controllerTitle.textContent = '稳定控制面（Controller）';
    const adapter = document.createElement('span'); adapter.className = 'state'; adapter.textContent = controller.adapter;
    controllerHeading.append(controllerTitle, adapter);
    const controllerFacts = document.createElement('dl'); controllerFacts.className = 'read-facts';
    controllerFacts.append(fact('Product source', controller.sourceRoot), fact('Controller identity', controller.identity));
    controllerCard.append(controllerHeading, controllerFacts); scopes.append(controllerCard);
    for (const scope of data.environment.scopes) {
      const card = document.createElement('article'); card.className = 'environment-scope-card';
      const heading = document.createElement('div'); heading.className = 'environment-scope-heading';
      const title = document.createElement('h3'); title.textContent = scope.selector;
      const placement = document.createElement('span'); placement.className = 'state'; placement.textContent = scope.shared ? '共享根' : '隔离 checkout';
      heading.append(title, placement);
      const facts = document.createElement('dl'); facts.className = 'read-facts';
      facts.append(
        fact('执行根', scope.executionRoot),
        fact('任务验证工作区根', scope.validationRoot),
        fact('来源', scope.sourcePath),
        fact('Git provider evidence', scope.provider ? `${scope.provider.capability} · ${scope.provider.evidence}` : '不适用'),
      );
      const probes = document.createElement('div'); probes.className = 'environment-probe-grid';
      for (const [label, value] of [['Runtime', scope.runtime], ['Workspace CLI', scope.cli], ['依赖', scope.dependencies], ['Runtime projection', scope.projection]]) {
        const item = document.createElement('div'); item.className = `environment-probe ${value.status}`;
        const name = document.createElement('span'); name.textContent = label;
        const state = document.createElement('strong'); state.textContent = probeStatusLabel(value.status);
        const evidence = document.createElement('small'); evidence.textContent = value.diagnostic || value.identity || `观察于 ${new Date(value.observedAt).toLocaleString('zh-CN')}`;
        item.append(name, state, evidence); probes.append(item);
      }
      card.append(heading, facts, probes); scopes.append(card);
    }

    const resources = document.getElementById('task-environment-resources'); resources.replaceChildren();
    if (!data.environment.resources.length) {
      const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = '当前没有已登记的 Task-owned 动态资源。'; resources.append(empty);
    } else {
      const list = document.createElement('div'); list.className = 'environment-resource-list';
      for (const resource of data.environment.resources) {
        const item = document.createElement('article'); item.className = 'environment-resource';
        const title = document.createElement('strong'); title.textContent = resource.id;
        const facts = document.createElement('dl'); facts.className = 'resource-facts';
        facts.append(fact('状态', resource.status), fact('Provider', resource.provider), fact('工作范围', resource.scope), fact('最近探测', `${probeStatusLabel(resource.probe.status)} · ${resource.probe.diagnostic || resource.probe.identity || resource.probe.observedAt}`));
        item.append(title, facts); list.append(item);
      }
      resources.append(list);
    }

    const cleanup = document.getElementById('task-environment-cleanup'); cleanup.replaceChildren();
    if (data.environment.latest.cleanup) cleanup.append(fact('状态', environmentStatusLabel(data.environment.latest.cleanup.status)), fact('完成时间', new Date(data.environment.latest.cleanup.completedAt).toLocaleString('zh-CN')), fact('摘要', data.environment.latest.cleanup.summary));
    else cleanup.append(fact('状态', '尚无 cleanup 结果'), fact('最近 ready', `${environmentStatusLabel(data.environment.latest.ready.status)} · ${new Date(data.environment.latest.ready.observedAt).toLocaleString('zh-CN')}`));
  }

  async function refreshEnvironment() {
    if (environmentLoading || !environmentPanel.isConnected) return;
    environmentLoading = true;
    document.getElementById('task-environment-loading').classList.remove('hidden');
    const button = document.getElementById('task-environment-refresh'); button.disabled = true;
    try {
      renderEnvironment(await api(`/api/v1/tasks/${encodeURIComponent(taskId)}/environment`));
    } catch (error) {
      renderEnvironment({ status: 'blocked', source: 'current-machine', observedAt: new Date().toISOString(), receipt: { available: false, path: '—' }, environment: null, diagnostic: { code: error.code || 'environment_read_failed', message: error.message }, nextActions: ['确认 Task 与当前 Workspace 后重试。'] });
    } finally {
      environmentLoading = false;
      if (environmentPanel.isConnected) { document.getElementById('task-environment-loading').classList.add('hidden'); button.disabled = false; }
    }
  }

  function selectTab(tab) {
    activeTab = tab;
    for (const button of document.querySelectorAll('[data-task-tab]')) {
      const selected = button.dataset.taskTab === tab; button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected));
    }
    for (const panel of document.querySelectorAll('[data-task-panel]')) panel.classList.toggle('hidden', panel.dataset.taskPanel !== tab);
    if (tab === 'environment') refreshEnvironment();
  }

  async function refresh() {
    const [workspace, data] = await Promise.all([api('/api/v1/workspace'), api(`/api/v1/tasks/${encodeURIComponent(taskId)}`)]); onWorkspace(workspace); render(data);
  }

  function showError(error) {
    const alert = document.getElementById('task-detail-alert'); alert.classList.remove('hidden'); alert.classList.toggle('error', error.code !== 'task_record_conflict'); alert.textContent = error.code === 'task_record_conflict' ? `${error.message} 请刷新本页。` : error.message;
    text('task-edit-state', error.code === 'task_record_conflict' ? '记录已变化' : '保存失败');
  }

  try { await refresh(); } catch (error) { errorPage(root, error.message); return; }

  for (const button of document.querySelectorAll('[data-task-tab]')) button.addEventListener('click', () => selectTab(button.dataset.taskTab));
  document.getElementById('task-environment-refresh').addEventListener('click', refreshEnvironment);
  const refreshOnFocus = () => {
    if (!environmentPanel.isConnected) { window.removeEventListener('focus', refreshOnFocus); return; }
    if (activeTab === 'environment') refreshEnvironment();
  };
  window.addEventListener('focus', refreshOnFocus);

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
