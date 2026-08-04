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

function applicabilityLabel(status) {
  return ({ current: '当前适用', stale: '已失效', unknown: '适用性未知' })[status] || status || '未知';
}

function developmentStatusLabel(status) {
  return ({
    missing: '尚未形成研发回执',
    planning: '规划中',
    developing: '研发中',
    'candidate-current': '候选已就绪',
    'handoff-current': '研发交接已就绪',
    unknown: '当前无法判断',
  })[status] || '当前无法判断';
}

function developmentAxisLabel(status) {
  return ({ current: '当前有效', stale: '已失效', missing: '尚未形成', unknown: '当前无法判断' })[status] || '当前无法判断';
}

function gateOutcomeLabel(outcome) {
  return ({ ready: '已就绪', 'changes-required': '需要修改', passed: '已通过', 'not-passed': '未通过' })[outcome] || '尚未形成';
}

function developmentDispositionLabel(disposition) {
  return ({ pending: '待形成', current: '当前事实', stale: '已失效', 'not-applicable': '不适用', waived: '已明确豁免' })[disposition] || disposition || '未知';
}

function decisionOutcomeLabel(outcome) {
  return ({ proceed: '允许推进', blocked: '阻止推进' })[outcome] || '尚未形成';
}

function capabilityOutcomeLabel(outcome) {
  return ({ passed: '已通过', failed: '失败', blocked: '受阻', skipped: '已跳过' })[outcome] || outcome || '未知';
}

function developmentReasonLabel(reason) {
  const labels = {
    'task-context-changed': '任务上下文已变化。',
    'content-target-changed': '内容目标已变化。',
    'declarations-changed': '验证能力声明已变化。',
    'policy-missing': '尚未形成验证策略。',
    'planning-changes-required': '方案审查要求修改。',
    'planning-missing-or-stale': '方案审查缺失或已失效。',
    'verification-missing-or-stale': '任务验证缺失或已失效。',
    'verification-not-passed': '任务验证尚未通过。',
    'required-facts-incomplete': '验证策略要求的事实尚不完整。',
    'candidate-stale': '当前候选已失效。',
    'completion-missing-or-stale': '完成审查缺失或已失效。',
    'completion-changes-required': '完成审查要求修改。',
  };
  return reason.message || labels[reason.code] || `当前状态原因：${reason.code || '未知'}。`;
}

function provenanceLabel(resolution) {
  if (resolution.availability !== 'available') return '当前不可用';
  const provenance = resolution.workingCopy?.provenance;
  if (provenance === 'task-environment-candidate') return `任务环境候选 · ${resolution.workingCopy.change.lifecycle === 'archived' ? '已归档' : '进行中'}`;
  if (provenance === 'retained-archive') return '保留工作区 · 已归档';
  return '保留工作区 · 进行中';
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

export async function renderTaskDetail({ root, api, onWorkspace, onBreadcrumb, navigate, openAgentAction, params }) {
  const taskId = params.taskId;
  root.innerHTML = `
    <section class="detail-page-header"><a class="back-link" href="/tasks" data-route>← 返回任务列表</a><div class="detail-title-row"><div><p class="eyebrow">任务</p><h1 id="task-detail-title">正在读取…</h1><p id="task-detail-intent" class="page-copy"></p></div><span id="task-detail-status" class="lifecycle-badge">—</span></div></section>
    <div id="task-detail-alert" class="alert hidden" role="status"></div>
    <nav class="detail-tabs" aria-label="任务详情"><button class="detail-tab active" type="button" data-task-tab="overview" aria-selected="true">概览</button><button class="detail-tab" type="button" data-task-tab="development" aria-selected="false">研发</button><button class="detail-tab" type="button" data-task-tab="evidence" aria-selected="false">证据</button><button class="detail-tab" type="button" data-task-tab="environment" aria-selected="false">环境</button></nav>
    <div id="task-overview-panel" data-task-panel="overview">
    <section class="detail-layout">
      <article class="panel"><div class="panel-heading"><div><h2>任务记录（Task Record）</h2><p class="section-copy">只展示顶层任务事实，不推断专业阶段状态。</p></div></div><dl class="read-facts detail-facts"><div><dt>任务 ID</dt><dd id="task-detail-id">—</dd></div><div><dt>项目范围</dt><dd id="task-detail-projects">—</dd></div><div><dt>服务范围</dt><dd id="task-detail-services">—</dd></div><div><dt>OpenSpec 变更</dt><dd id="task-detail-changes">—</dd></div><div><dt>结果</dt><dd id="task-detail-result">进行中</dd></div><div><dt>创建时间</dt><dd id="task-detail-created">—</dd></div><div><dt>更新时间</dt><dd id="task-detail-updated">—</dd></div></dl></article>
      <aside class="panel facts-panel"><p class="eyebrow">技术事实</p><h2>读取证据</h2><dl class="fact-list"><div><dt>数据格式</dt><dd>buildr.task-record/v1</dd></div><div><dt>规范路径</dt><dd id="task-detail-path">—</dd></div><div><dt>记录摘要（recordDigest）</dt><dd id="task-detail-digest">—</dd></div></dl></aside>
    </section>
    <section id="task-active-actions" class="task-actions">
      <article class="panel"><div class="panel-heading"><div><h2>编辑进行中的任务</h2><p class="section-copy">保存时只提交明确的设置与增删操作；陈旧页面不会覆盖新内容。</p></div><span id="task-edit-state" class="state">可以修改</span></div><form id="task-edit-form" class="prompt-grid"><label>标题<input id="task-edit-title" required></label><label class="full">意图<textarea id="task-edit-intent" rows="3" required></textarea></label><label>项目范围<textarea id="task-edit-projects" rows="3"></textarea></label><label>服务范围（project/service）<textarea id="task-edit-services" rows="3"></textarea></label><label class="full">OpenSpec 变更（project/change）<textarea id="task-edit-changes" rows="3"></textarea></label><div class="actions full"><button id="task-edit-button" class="button primary" type="submit">保存任务记录</button></div></form></article>
      <article class="panel terminal-panel"><div class="panel-heading"><div><h2>结束任务</h2><p class="section-copy">只更新顶层状态；不会执行任务收尾（Task Finish）、Git、任务验证、任务环境清理或其他专业动作。</p></div></div><div class="terminal-action-grid"><form id="task-complete-form"><h3>完成</h3><label>完成摘要<textarea id="task-complete-summary" rows="3" required></textarea></label><label>是否无需交付变更<select id="task-complete-no-change" required><option value="">请选择</option><option value="false">有交付变更</option><option value="true">确认无需变更</option></select></label><button class="button secondary" type="submit">确认完成</button></form><form id="task-abandon-form"><h3>放弃</h3><label>放弃原因<textarea id="task-abandon-reason" rows="3" required></textarea></label><button class="button danger" type="submit">确认放弃</button></form></div></article>
    </section>
    <section id="task-terminal-note" class="empty-state hidden"><h2>这是终态任务记录</h2><p>顶层事实保持只读，不提供重开或继续修改入口。专业模块仍由各自权威来源管理。</p></section>
    </div>
    <section id="task-development-panel" class="hidden" data-task-panel="development" aria-live="polite">
      <article class="panel development-summary"><div class="panel-heading"><div><p class="eyebrow">研发事实</p><h2>任务研发（Task Development）</h2><p class="section-copy">从首个正式研发动作开始，只读聚合规划节点、当前目标、候选、门禁与最近一次交接；各专业内容仍由原 authority 管理。</p></div><button id="task-development-refresh" class="button secondary" type="button">刷新研发状态</button></div><dl class="read-facts"><div><dt>当前结论</dt><dd id="task-development-status">尚未读取</dd></div><div><dt>更新时间</dt><dd id="task-development-updated">—</dd></div><div><dt>研发回执</dt><dd id="task-development-receipt">—</dd></div></dl><div id="task-development-diagnostic" class="environment-diagnostic hidden"></div></article>
      <div id="task-development-loading" class="page-loading hidden"><span class="loader"></span><p>正在读取研发状态…</p></div>
      <section id="task-development-empty" class="empty-state hidden"><h2 id="task-development-empty-title">尚未形成研发回执</h2><p id="task-development-empty-copy">任务仍可继续推进；从写提案、写方案或直接实现等首个正式研发动作开始，这里会记录研发事实。</p></section>
      <div id="task-development-detail" class="development-detail hidden">
        <section class="panel"><div class="panel-heading"><div><h2>当前有效性</h2><p class="section-copy">分别判断任务上下文、内容目标、验证策略、候选与研发交接是否仍然有效。</p></div></div><div id="task-development-axes" class="development-axis-grid"></div></section>
        <section class="panel"><div class="panel-heading"><div><h2>研发规划事实</h2><p class="section-copy">节点不构成必经工作流；存在时仅记录其 authority、引用、身份与当前处置。</p></div></div><div id="task-development-planning" class="development-planning-list"></div></section>
        <section class="detail-layout"><article class="panel"><div class="panel-heading"><div><h2>当前候选</h2><p class="section-copy">候选由研发模块冻结；页面不重新计算身份。</p></div></div><dl id="task-development-candidate" class="read-facts"></dl></article><aside class="panel facts-panel"><p class="eyebrow">研发决策</p><h2>保存的推进结论</h2><dl id="task-development-decision" class="fact-list"></dl><div id="task-development-risks" class="development-risk-list"></div></aside></section>
        <section class="panel"><div class="panel-heading"><div><h2>交付门禁</h2><p class="section-copy">方案审查、任务验证和完成审查的当前结果；详情统一进入“证据”。</p></div></div><div id="task-development-gates" class="development-gate-grid"></div></section>
        <section class="panel"><div class="panel-heading"><div><h2>最近保存的研发交接</h2><p class="section-copy">仅展示最近一次不可变快照；当前有效性以实时适用性判断为准。</p></div></div><dl id="task-development-handoff" class="read-facts"></dl><p id="task-development-history-note" class="development-status-note hidden"></p></section>
      </div>
    </section>
    <section id="task-environment-panel" class="hidden" data-task-panel="environment" aria-live="polite">
      <article class="panel environment-summary"><div class="panel-heading"><div><p class="eyebrow">当前机器事实</p><h2>任务环境（Task Environment）</h2><p class="section-copy">只读探测当前环境；不会准备、恢复或清理任何资源。</p></div><button id="task-environment-refresh" class="button secondary" type="button">刷新当前事实</button></div><dl class="read-facts"><div><dt>状态</dt><dd id="task-environment-status">尚未读取</dd></div><div><dt>观察时间</dt><dd id="task-environment-observed">—</dd></div><div><dt>来源</dt><dd id="task-environment-source">当前机器（current-machine）</dd></div><div><dt>环境回执（Environment Receipt）</dt><dd id="task-environment-receipt">—</dd></div></dl><div id="task-environment-diagnostic" class="environment-diagnostic hidden"></div></article>
      <div id="task-environment-loading" class="page-loading hidden"><span class="loader"></span><p>正在探测当前环境…</p></div>
      <div id="task-environment-detail" class="environment-detail hidden"><section class="panel"><div class="panel-heading"><div><h2>工作范围与执行基础</h2><p class="section-copy">每个范围展示真实执行根、任务验证工作区根与最小探测。</p></div></div><div id="task-environment-scopes" class="environment-scope-list"></div></section><section class="detail-layout"><article class="panel"><div class="panel-heading"><div><h2>动态资源</h2><p class="section-copy">只展示环境应用层返回的非敏感事实。</p></div></div><div id="task-environment-resources"></div></article><aside class="panel facts-panel"><p class="eyebrow">处置事实</p><h2>清理结果</h2><dl id="task-environment-cleanup" class="fact-list"></dl></aside></section></div>
    </section>
    <section id="task-evidence-panel" class="hidden" data-task-panel="evidence" aria-live="polite">
      <section id="task-review-panel" class="evidence-section">
        <article class="panel review-summary"><div class="panel-heading"><div><p class="eyebrow">轻量语义证据</p><h2>审查结果（Review Results）</h2><p class="section-copy">方案审查与完成审查是两个可选的当前槽位；这里只读展示，不在页面内编辑结果。</p></div><button id="task-review-refresh" class="button secondary" type="button">刷新审查结果</button></div><div id="task-review-diagnostic" class="environment-diagnostic hidden"></div></article>
        <div id="task-review-loading" class="page-loading hidden"><span class="loader"></span><p>正在读取审查结果…</p></div>
        <div id="task-review-slots" class="review-slot-grid"></div>
      </section>
      <section id="task-verification-panel" class="evidence-section">
        <article class="panel review-summary"><div class="panel-heading"><div><p class="eyebrow">可移植的当前事实</p><h2>验证结果（Verification Result）</h2><p class="section-copy">这里只读展示一个当前结果；完整命令输出和临时执行证据不进入本页。</p></div><button id="task-verification-refresh" class="button secondary" type="button">刷新验证结果</button></div><div id="task-verification-diagnostic" class="environment-diagnostic hidden"></div></article>
        <div id="task-verification-loading" class="page-loading hidden"><span class="loader"></span><p>正在读取验证结果…</p></div>
        <div id="task-verification-result" class="review-slot-grid"></div>
      </section>
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

  const developmentPanel = document.getElementById('task-development-panel');
  const environmentPanel = document.getElementById('task-environment-panel');
  const reviewPanel = document.getElementById('task-review-panel');
  const verificationPanel = document.getElementById('task-verification-panel');
  let activeTab = 'overview';
  let developmentLoading = false;
  let environmentLoading = false;
  let reviewLoading = false;
  let verificationLoading = false;

  function developmentAxisCard(label, status) {
    const card = document.createElement('article'); card.className = `development-axis-card ${status}`;
    const name = document.createElement('span'); name.textContent = label;
    const value = document.createElement('strong'); value.textContent = developmentAxisLabel(status);
    card.append(name, value); return card;
  }

  function developmentGateCard(label, gate, unknown) {
    const status = unknown ? 'unknown' : gate ? 'current' : 'missing';
    const card = document.createElement('article'); card.className = `development-gate-card ${status}`;
    const heading = document.createElement('div'); heading.className = 'development-gate-heading';
    const name = document.createElement('strong'); name.textContent = label;
    const value = document.createElement('span'); value.className = `state review-state ${status}`; value.textContent = unknown ? '当前无法判断' : gate?.disposition ? developmentDispositionLabel(gate.disposition) : gateOutcomeLabel(gate?.outcome);
    heading.append(name, value); card.append(heading);
    const identity = document.createElement('small'); identity.className = 'development-identity'; identity.textContent = gate ? (gate.resultDigest ? `${gate.targetIdentity} · ${gate.resultDigest}` : `${gate.summary} · ${gate.source}`) : (unknown ? '当前无法实时复核目标。' : '尚未形成当前门禁结果。'); card.append(identity);
    if (gate?.resultDigest) { const action = document.createElement('button'); action.type = 'button'; action.className = 'text-button'; action.textContent = '查看证据'; action.addEventListener('click', () => selectTab('evidence')); card.append(action); }
    return card;
  }

  function developmentPlanningCard(node) {
    const card = document.createElement('article'); card.className = `development-planning-card ${node.disposition}`;
    const heading = document.createElement('div'); heading.className = 'development-gate-heading';
    const name = document.createElement('strong'); name.textContent = `${node.kind} · ${node.id}`;
    const disposition = document.createElement('span'); disposition.className = 'state'; disposition.textContent = developmentDispositionLabel(node.disposition);
    heading.append(name, disposition); card.append(heading);
    const reference = document.createElement('p'); reference.textContent = `${node.authority} · ${node.reference}`; card.append(reference);
    const summary = document.createElement('p'); summary.textContent = node.summary || '未提供摘要'; card.append(summary);
    const identity = document.createElement('small'); identity.className = 'development-identity'; identity.textContent = node.source ? `${node.identity} · ${node.source}` : node.identity; card.append(identity);
    return card;
  }

  function renderDevelopment(data) {
    if (!developmentPanel.isConnected) return;
    const development = data.development;
    const applicability = development?.applicability;
    const status = data.status === 'missing' ? 'missing' : applicability?.status || 'unknown';
    const receipt = development?.receipt;
    text('task-development-status', developmentStatusLabel(status));
    text('task-development-updated', receipt?.updatedAt ? new Date(receipt.updatedAt).toLocaleString('zh-CN') : '—');
    text('task-development-receipt', development ? `${development.receiptDigest} · ${development.path}` : '尚未形成');

    const diagnostic = document.getElementById('task-development-diagnostic'); diagnostic.replaceChildren();
    const reasons = applicability?.reasons || [];
    if (data.diagnostic || data.nextActions?.length || reasons.length) {
      diagnostic.classList.remove('hidden');
      if (data.diagnostic) { const message = document.createElement('p'); message.textContent = data.diagnostic.message; diagnostic.append(message); }
      const values = [...reasons.map(developmentReasonLabel), ...(data.nextActions || [])];
      if (values.length) {
        const list = document.createElement('ul');
        for (const value of values) { const item = document.createElement('li'); item.textContent = value; list.append(item); }
        diagnostic.append(list);
      }
    } else diagnostic.classList.add('hidden');

    const empty = document.getElementById('task-development-empty');
    const detail = document.getElementById('task-development-detail');
    empty.classList.toggle('hidden', Boolean(development));
    detail.classList.toggle('hidden', !development);
    text('task-development-empty-title', data.status === 'missing' ? '尚未形成研发回执' : '当前无法读取研发状态');
    text('task-development-empty-copy', data.status === 'missing' ? '任务仍可继续推进；从写提案、写方案或直接实现等首个正式研发动作开始，这里会记录研发事实。' : '当前读取失败，没有足够事实判断候选或交接状态。请根据诊断处理后重试。');
    if (!development) return;

    const unknown = status === 'unknown';
    const axes = document.getElementById('task-development-axes'); axes.replaceChildren();
    for (const [label, key] of [['任务上下文', 'taskContext'], ['研发规划', 'planning'], ['内容目标', 'contentTarget'], ['验证策略', 'policy'], ['当前候选', 'candidate'], ['研发交接', 'handoff']]) {
      axes.append(developmentAxisCard(label, unknown ? 'unknown' : applicability?.[key] || 'unknown'));
    }

    const planning = document.getElementById('task-development-planning'); planning.replaceChildren();
    if (receipt.planning.nodes.length) for (const node of receipt.planning.nodes) planning.append(developmentPlanningCard(node));
    else { const note = document.createElement('p'); note.className = 'development-status-note'; note.textContent = '当前没有需要记录的规划节点；这不阻止研发继续。'; planning.append(note); }

    const candidate = document.getElementById('task-development-candidate'); candidate.replaceChildren();
    candidate.append(
      fact('候选代次', receipt.candidate ? String(receipt.candidate.generation) : receipt.generation ? `第 ${receipt.generation} 代已失效` : '尚未形成'),
      fact('候选身份', receipt.candidate?.identity || '尚未形成'),
      fact('任务上下文身份', receipt.taskContext.identity),
      fact('内容目标身份', receipt.contentTarget?.identity || '尚未稳定'),
      fact('验证策略身份', receipt.verificationPolicy?.identity || '尚未形成'),
    );

    const decision = document.getElementById('task-development-decision'); decision.replaceChildren(
      fact('已保存结论', decisionOutcomeLabel(receipt.decision?.outcome)),
      fact('摘要', receipt.decision?.summary || '尚未形成'),
      fact('已接受风险数', String(receipt.decision?.risks?.length || 0)),
    );
    const risks = document.getElementById('task-development-risks'); risks.replaceChildren();
    if (receipt.decision?.risks?.length) {
      const heading = document.createElement('h3'); heading.textContent = '已接受风险'; risks.append(heading);
      const list = document.createElement('ul');
      for (const risk of receipt.decision.risks) { const item = document.createElement('li'); item.textContent = `${risk.gate === 'verification' ? '任务验证' : '完成审查'} · ${risk.scope}：${risk.summary}`; list.append(item); }
      risks.append(list);
    }

    const gates = document.getElementById('task-development-gates'); gates.replaceChildren(
      developmentGateCard('方案审查', applicability?.gates?.planning, unknown),
      developmentGateCard('任务验证', applicability?.gates?.verification, unknown),
      developmentGateCard('完成审查', applicability?.gates?.completion, unknown),
    );

    const handoffs = receipt.handoffs || [];
    const latest = handoffs.at(-1);
    const handoff = document.getElementById('task-development-handoff'); handoff.replaceChildren();
    if (latest) {
      handoff.append(
        fact('当前有效性', developmentAxisLabel(unknown ? 'unknown' : applicability?.handoff || 'unknown')),
        fact('交接身份', latest.identity),
        fact('候选代次', String(latest.candidate.generation)),
        fact('形成时间', new Date(latest.createdAt).toLocaleString('zh-CN')),
        fact('已保存交接数', String(handoffs.length)),
      );
    } else handoff.append(fact('状态', '尚未形成'), fact('已保存交接数', '0'));
    const historyNote = document.getElementById('task-development-history-note');
    historyNote.classList.toggle('hidden', !latest || (!unknown && applicability?.handoff === 'current'));
    historyNote.textContent = unknown ? '历史研发交接仍被保留，但当前无法实时复核。' : '最近保存的研发交接仍被保留，但已不再代表当前交付状态。';
  }

  async function refreshDevelopment() {
    if (developmentLoading || !developmentPanel.isConnected) return;
    developmentLoading = true;
    document.getElementById('task-development-loading').classList.remove('hidden');
    const button = document.getElementById('task-development-refresh'); button.disabled = true;
    try {
      renderDevelopment(await api(`/api/v1/tasks/${encodeURIComponent(taskId)}/development`));
    } catch (error) {
      renderDevelopment({ status: 'unavailable', development: null, diagnostic: { code: error.code || 'task_development_read_failed', message: error.message }, nextActions: [] });
    } finally {
      developmentLoading = false;
      if (developmentPanel.isConnected) { document.getElementById('task-development-loading').classList.add('hidden'); button.disabled = false; }
    }
  }

  function renderEnvironment(data) {
    if (!environmentPanel.isConnected) return;
    text('task-environment-status', environmentStatusLabel(data.status));
    text('task-environment-observed', data.observedAt ? new Date(data.observedAt).toLocaleString('zh-CN') : '—');
    text('task-environment-source', data.source === 'current-machine' || !data.source ? '当前机器（current-machine）' : data.source);
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
    const controllerTitle = document.createElement('h3'); controllerTitle.textContent = '环境管理器（Environment Manager）';
    const adapter = document.createElement('span'); adapter.className = 'state'; adapter.textContent = controller.adapter;
    controllerHeading.append(controllerTitle, adapter);
    const controllerFacts = document.createElement('dl'); controllerFacts.className = 'read-facts';
    controllerFacts.append(fact('产品源码', controller.sourceRoot), fact('回执创建指纹', controller.identity));
    controllerCard.append(controllerHeading, controllerFacts); scopes.append(controllerCard);
    for (const scope of data.environment.scopes) {
      const card = document.createElement('article'); card.className = 'environment-scope-card';
      const heading = document.createElement('div'); heading.className = 'environment-scope-heading';
      const title = document.createElement('h3'); title.textContent = scope.selector;
      const placement = document.createElement('span'); placement.className = 'state'; placement.textContent = scope.shared ? '共享根' : '隔离检出（checkout）';
      heading.append(title, placement);
      const facts = document.createElement('dl'); facts.className = 'read-facts';
      facts.append(
        fact('执行根', scope.executionRoot),
        fact('任务验证工作区根', scope.validationRoot),
        fact('来源', scope.sourcePath),
        fact('Git 提供方证据', scope.provider ? `${scope.provider.capability} · ${scope.provider.evidence}` : '不适用'),
      );
      const probes = document.createElement('div'); probes.className = 'environment-probe-grid';
      for (const [label, value] of [['运行时（Runtime）', scope.runtime], ['工作区 CLI', scope.cli], ['依赖', scope.dependencies], ['运行时投影', scope.projection]]) {
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
      const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = '当前没有已登记的任务所属动态资源。'; resources.append(empty);
    } else {
      const list = document.createElement('div'); list.className = 'environment-resource-list';
      for (const resource of data.environment.resources) {
        const item = document.createElement('article'); item.className = 'environment-resource';
        const title = document.createElement('strong'); title.textContent = resource.id;
        const facts = document.createElement('dl'); facts.className = 'resource-facts';
        facts.append(fact('状态', resource.status), fact('提供方', resource.provider), fact('工作范围', resource.scope), fact('最近探测', `${probeStatusLabel(resource.probe.status)} · ${resource.probe.diagnostic || resource.probe.identity || resource.probe.observedAt}`));
        item.append(title, facts); list.append(item);
      }
      resources.append(list);
    }

    const cleanup = document.getElementById('task-environment-cleanup'); cleanup.replaceChildren();
    if (data.environment.latest.cleanup) cleanup.append(fact('状态', environmentStatusLabel(data.environment.latest.cleanup.status)), fact('完成时间', new Date(data.environment.latest.cleanup.completedAt).toLocaleString('zh-CN')), fact('摘要', data.environment.latest.cleanup.summary));
    else cleanup.append(fact('状态', '尚无清理结果'), fact('最近就绪状态', `${environmentStatusLabel(data.environment.latest.ready.status)} · ${new Date(data.environment.latest.ready.observedAt).toLocaleString('zh-CN')}`));
  }

  async function refreshEnvironment() {
    if (environmentLoading || !environmentPanel.isConnected) return;
    environmentLoading = true;
    document.getElementById('task-environment-loading').classList.remove('hidden');
    const button = document.getElementById('task-environment-refresh'); button.disabled = true;
    try {
      renderEnvironment(await api(`/api/v1/tasks/${encodeURIComponent(taskId)}/environment`));
    } catch (error) {
      renderEnvironment({ status: 'blocked', source: 'current-machine', observedAt: new Date().toISOString(), receipt: { available: false, path: '—' }, environment: null, diagnostic: { code: error.code || 'environment_read_failed', message: error.message }, nextActions: ['确认任务与当前工作空间后重试。'] });
    } finally {
      environmentLoading = false;
      if (environmentPanel.isConnected) { document.getElementById('task-environment-loading').classList.add('hidden'); button.disabled = false; }
    }
  }

  function reviewList(title, values, describe = (value) => value) {
    const section = document.createElement('section'); section.className = 'review-evidence-section';
    const heading = document.createElement('h4'); heading.textContent = title; section.append(heading);
    if (!values.length) {
      const empty = document.createElement('p'); empty.className = 'review-list-empty'; empty.textContent = '无'; section.append(empty); return section;
    }
    const list = document.createElement('ul');
    for (const value of values) { const item = document.createElement('li'); item.textContent = describe(value); list.append(item); }
    section.append(list); return section;
  }

  function renderReviewSlot(reviewType, slot) {
    const card = document.createElement('article'); card.className = `review-slot-card ${slot.present ? slot.applicability : 'missing'}`;
    const heading = document.createElement('div'); heading.className = 'review-slot-heading';
    const titleWrap = document.createElement('div');
    const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = reviewType === 'planning' ? '计划目标' : '完成候选';
    const title = document.createElement('h3'); title.textContent = reviewType === 'planning' ? '方案审查（Planning Review）' : '完成审查（Completion Review）';
    titleWrap.append(eyebrow, title);
    const state = document.createElement('span'); state.className = `state review-state ${slot.present ? slot.applicability : 'missing'}`;
    state.textContent = !slot.present ? '未记录' : ({ current: '当前适用', stale: '目标已变化', unknown: '适用性未知' })[slot.applicability] || '未知';
    heading.append(titleWrap, state); card.append(heading);

    if (!slot.present) {
      const empty = document.createElement('div'); empty.className = 'review-slot-empty'; empty.textContent = '尚未形成完整结果；不会创建空占位记录。'; card.append(empty);
    } else {
      const result = slot.result;
      const facts = document.createElement('dl'); facts.className = 'read-facts review-facts';
      facts.append(
        fact('目标身份', result.targetIdentity),
        fact('执行方式', ({ self: '自审', 'independent-agent': '独立智能体（Agent）', human: '人工' })[result.method] || result.method),
        fact('完成时间', new Date(result.completedAt).toLocaleString('zh-CN')),
        fact('结果摘要（resultDigest）', slot.resultDigest),
      );
      const conclusion = document.createElement('div'); conclusion.className = `review-conclusion ${result.conclusion.outcome}`;
      const outcome = document.createElement('strong'); outcome.textContent = result.conclusion.outcome === 'ready' ? '已就绪' : '需要修改';
      const summary = document.createElement('p'); summary.textContent = result.conclusion.summary;
      conclusion.append(outcome, summary);
      const evidence = document.createElement('div'); evidence.className = 'review-evidence-grid';
      evidence.append(
        reviewList('已审阅', result.reviewed),
        reviewList('未覆盖', result.uncovered, (item) => `${item.subject}：${item.reason}`),
        reviewList('发现', result.findings),
      );
      const technical = document.createElement('small'); technical.className = 'review-result-path'; technical.textContent = slot.path;
      card.append(facts, conclusion, evidence, technical);
    }

    const actions = document.createElement('div'); actions.className = 'review-slot-actions';
    const action = document.createElement('button'); action.type = 'button'; action.className = 'button secondary';
    const active = current?.record.status === 'active'; action.disabled = !active;
    action.textContent = active ? '交给智能体审查' : '终态只读';
    action.addEventListener('click', () => openAgentAction('task-review', { taskId, reviewType }));
    actions.append(action); card.append(actions);
    return card;
  }

  function renderReview(data) {
    if (!reviewPanel.isConnected) return;
    const diagnostic = document.getElementById('task-review-diagnostic'); diagnostic.classList.add('hidden'); diagnostic.textContent = '';
    const slots = document.getElementById('task-review-slots'); slots.replaceChildren(
      renderReviewSlot('planning', data.slots.planning),
      renderReviewSlot('completion', data.slots.completion),
    );
  }

  async function refreshReview() {
    if (reviewLoading || !reviewPanel.isConnected) return;
    reviewLoading = true;
    document.getElementById('task-review-loading').classList.remove('hidden');
    const button = document.getElementById('task-review-refresh'); button.disabled = true;
    try {
      renderReview(await api(`/api/v1/tasks/${encodeURIComponent(taskId)}/reviews`));
    } catch (error) {
      const diagnostic = document.getElementById('task-review-diagnostic'); diagnostic.classList.remove('hidden'); diagnostic.textContent = `${error.code || 'task_review_read_failed'}：${error.message}`;
    } finally {
      reviewLoading = false;
      if (reviewPanel.isConnected) { document.getElementById('task-review-loading').classList.add('hidden'); button.disabled = false; }
    }
  }

  function renderVerification(data) {
    if (!verificationPanel.isConnected) return;
    const diagnostic = document.getElementById('task-verification-diagnostic'); diagnostic.classList.add('hidden'); diagnostic.textContent = '';
    const container = document.getElementById('task-verification-result'); container.replaceChildren();
    const slot = data.slot;
    const card = document.createElement('article'); card.className = `review-slot-card ${slot.present ? slot.applicability.status : 'missing'}`;
    const heading = document.createElement('div'); heading.className = 'review-slot-heading';
    const titleWrap = document.createElement('div');
    const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = '单一当前槽位';
    const title = document.createElement('h3'); title.textContent = '验证结果（Verification Result）'; titleWrap.append(eyebrow, title);
    const state = document.createElement('span'); state.className = `state review-state ${slot.present ? slot.applicability.status : 'missing'}`;
    state.textContent = slot.present ? applicabilityLabel(slot.applicability.status) : '未记录'; heading.append(titleWrap, state); card.append(heading);
    if (!slot.present) {
      const empty = document.createElement('div'); empty.className = 'review-slot-empty'; empty.textContent = '尚未形成完整结果；不会创建空占位或从当前代码版本（HEAD）推断验证状态。'; card.append(empty);
    } else {
      const result = slot.result;
      const facts = document.createElement('dl'); facts.className = 'read-facts review-facts';
      facts.append(
        fact('目标身份', result.target.identity),
        fact('验证目标', result.target.summary),
        fact('目标适用性', applicabilityLabel(slot.applicability.target.status)),
        fact('声明适用性', applicabilityLabel(slot.applicability.declarations.status)),
        fact('完成时间', new Date(result.completedAt).toLocaleString('zh-CN')),
        fact('结果摘要（resultDigest）', slot.resultDigest),
      );
      const conclusion = document.createElement('div'); conclusion.className = `review-conclusion ${result.conclusion.outcome}`;
      const outcome = document.createElement('strong'); outcome.textContent = result.conclusion.outcome === 'passed' ? '已通过' : '未通过';
      const summary = document.createElement('p'); summary.textContent = result.conclusion.summary; conclusion.append(outcome, summary);
      const evidence = document.createElement('div'); evidence.className = 'review-evidence-grid';
      evidence.append(
        reviewList('能力声明', result.declarations, (item) => `${item.project} · ${item.identity} · ${item.path}`),
        reviewList('实际能力事实', result.capabilities, (item) => `${item.project}/${item.capability} · ${capabilityOutcomeLabel(item.outcome)} · ${item.facts.join('；')}`),
        reviewList('覆盖缺口', result.coverageGaps, (item) => `${item.scope}：${item.summary}`),
        reviewList('失效原因', slot.applicability.reasons, (item) => `${item.code}：${item.message}`),
      );
      const technical = document.createElement('small'); technical.className = 'review-result-path'; technical.textContent = slot.path;
      card.append(facts, conclusion, evidence, technical);
    }
    const actions = document.createElement('div'); actions.className = 'review-slot-actions';
    const action = document.createElement('button'); action.type = 'button'; action.className = 'button secondary';
    const active = current?.record.status === 'active'; action.disabled = !active; action.textContent = active ? '交给智能体验证' : '终态只读';
    action.addEventListener('click', () => openAgentAction('task-verification', { taskId })); actions.append(action); card.append(actions); container.append(card);
  }

  async function refreshVerification() {
    if (verificationLoading || !verificationPanel.isConnected) return;
    verificationLoading = true;
    document.getElementById('task-verification-loading').classList.remove('hidden');
    const button = document.getElementById('task-verification-refresh'); button.disabled = true;
    try {
      renderVerification(await api(`/api/v1/tasks/${encodeURIComponent(taskId)}/verification`));
    } catch (error) {
      const diagnostic = document.getElementById('task-verification-diagnostic'); diagnostic.classList.remove('hidden'); diagnostic.textContent = `${error.code || 'task_verification_read_failed'}：${error.message}`;
    } finally {
      verificationLoading = false;
      if (verificationPanel.isConnected) { document.getElementById('task-verification-loading').classList.add('hidden'); button.disabled = false; }
    }
  }

  function selectTab(tab) {
    activeTab = tab;
    for (const button of document.querySelectorAll('[data-task-tab]')) {
      const selected = button.dataset.taskTab === tab; button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected));
    }
    for (const panel of document.querySelectorAll('[data-task-panel]')) panel.classList.toggle('hidden', panel.dataset.taskPanel !== tab);
    if (tab === 'development') refreshDevelopment();
    if (tab === 'environment') refreshEnvironment();
    if (tab === 'evidence') { refreshReview(); refreshVerification(); }
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
  document.getElementById('task-development-refresh').addEventListener('click', refreshDevelopment);
  document.getElementById('task-environment-refresh').addEventListener('click', refreshEnvironment);
  document.getElementById('task-review-refresh').addEventListener('click', refreshReview);
  document.getElementById('task-verification-refresh').addEventListener('click', refreshVerification);
  const refreshOnFocus = () => {
    if (!developmentPanel.isConnected) { window.removeEventListener('focus', refreshOnFocus); return; }
    if (activeTab === 'development') refreshDevelopment();
    if (activeTab === 'environment') refreshEnvironment();
    if (activeTab === 'evidence') { refreshReview(); refreshVerification(); }
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
    if (!window.confirm('确认只把顶层任务记录标记为完成？这不会执行任务收尾（Task Finish）、Git、任务验证或任务环境清理。')) return;
    try { await api(`/api/v1/tasks/${encodeURIComponent(taskId)}/complete`, { method: 'POST', body: JSON.stringify({ expectedRecordDigest: current.recordDigest, summary: document.getElementById('task-complete-summary').value, noChange: selection === 'true' }) }); await navigate(`/tasks/${encodeURIComponent(taskId)}`); } catch (error) { showError(error); }
  });

  document.getElementById('task-abandon-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (!window.confirm('确认只把顶层任务记录标记为放弃？这不会清理任务环境、执行 Git 或其他专业动作。')) return;
    try { await api(`/api/v1/tasks/${encodeURIComponent(taskId)}/abandon`, { method: 'POST', body: JSON.stringify({ expectedRecordDigest: current.recordDigest, reason: document.getElementById('task-abandon-reason').value }) }); await navigate(`/tasks/${encodeURIComponent(taskId)}`); } catch (error) { showError(error); }
  });
}
