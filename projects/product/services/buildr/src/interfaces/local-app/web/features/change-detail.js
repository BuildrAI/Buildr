import { renderMarkdown } from '/markdown.js';

function contentView(raw, { contentClass }) {
  const wrap = document.createElement('div');
  wrap.className = 'content-view';

  const toggle = document.createElement('div');
  toggle.className = 'content-view-toggle';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', '内容视图');

  const renderedButton = document.createElement('button');
  renderedButton.type = 'button';
  renderedButton.className = 'content-view-option is-active';
  renderedButton.setAttribute('aria-pressed', 'true');
  renderedButton.textContent = '渲染';

  const sourceButton = document.createElement('button');
  sourceButton.type = 'button';
  sourceButton.className = 'content-view-option';
  sourceButton.setAttribute('aria-pressed', 'false');
  sourceButton.textContent = '原文';

  toggle.append(renderedButton, sourceButton);

  const rendered = renderMarkdown(raw, { headingOffset: 1, allowRelativeLinks: true });
  rendered.classList.add(contentClass, 'content-view-pane', 'is-active');
  rendered.setAttribute('data-view', 'rendered');

  const source = document.createElement('pre');
  source.className = `${contentClass} content-view-pane content-view-source`;
  source.setAttribute('data-view', 'source');
  source.hidden = true;
  source.textContent = String(raw ?? '');

  function setView(mode) {
    const renderedMode = mode === 'rendered';
    renderedButton.classList.toggle('is-active', renderedMode);
    sourceButton.classList.toggle('is-active', !renderedMode);
    renderedButton.setAttribute('aria-pressed', renderedMode ? 'true' : 'false');
    sourceButton.setAttribute('aria-pressed', renderedMode ? 'false' : 'true');
    rendered.classList.toggle('is-active', renderedMode);
    source.classList.toggle('is-active', !renderedMode);
    rendered.hidden = !renderedMode;
    source.hidden = renderedMode;
  }

  renderedButton.addEventListener('click', () => setView('rendered'));
  sourceButton.addEventListener('click', () => setView('source'));

  wrap.append(toggle, rendered, source);
  return wrap;
}

function artifactPanel(label, artifact) {
  const article = document.createElement('article'); article.className = 'artifact-panel';
  const heading = document.createElement('div'); heading.className = 'artifact-heading';
  const title = document.createElement('strong'); title.textContent = label;
  const path = document.createElement('small'); path.textContent = artifact.path;
  heading.append(title, path); article.append(heading);
  if (artifact.exists) {
    article.append(contentView(artifact.content, { contentClass: 'artifact-content' }));
  } else {
    const missing = document.createElement('p'); missing.className = 'artifact-missing'; missing.textContent = '未声明'; article.append(missing);
  }
  return article;
}

function briefPanel(brief) {
  const section = document.createElement('section'); section.className = 'panel change-brief-panel';
  const heading = document.createElement('div'); heading.className = 'panel-heading';
  const copy = document.createElement('div');
  const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = '先了解变更';
  const title = document.createElement('h2'); title.textContent = '变更说明';
  copy.append(eyebrow, title);
  const state = document.createElement('span'); state.className = 'state'; state.textContent = brief.exists ? '人类可读' : '未提供';
  heading.append(copy, state); section.append(heading);
  if (!brief.exists) {
    const missing = document.createElement('div'); missing.className = 'brief-missing';
    const message = document.createElement('p'); message.textContent = '这个变更还没有人类可读 Brief。你仍可以继续查看下方 OpenSpec 技术产物。';
    const source = document.createElement('small'); source.textContent = brief.path;
    missing.append(message, source); section.append(missing); return section;
  }
  const content = contentView(brief.content, { contentClass: 'brief-content' });
  const source = document.createElement('small'); source.className = 'brief-source'; source.textContent = brief.path;
  section.append(content, source); return section;
}

export async function renderChangeDetail({ root, api, onWorkspace, onBreadcrumb, openAgentAction, params }) {
  const { projectCode, taskId } = params;
  const changeRef = params.changeRef || params.changeCode;
  const taskScoped = Boolean(taskId);
  const backPath = taskScoped ? `/tasks/${encodeURIComponent(taskId)}` : '/changes';
  const endpoint = taskScoped
    ? `/api/v1/tasks/${encodeURIComponent(taskId)}/changes/${encodeURIComponent(projectCode)}/${encodeURIComponent(changeRef)}`
    : `/api/v1/projects/${encodeURIComponent(projectCode)}/changes/${encodeURIComponent(changeRef)}`;
  root.innerHTML = `<section class="page-header change-detail-header"><a class="back-link" href="${backPath}" data-route>← ${taskScoped ? '返回任务详情' : '返回变更目录'}</a><div class="page-header-row"><div><p class="eyebrow">${taskScoped ? '任务关联变更' : '变更'}</p><h1 id="change-detail-name">正在读取…</h1><p id="change-detail-copy" class="page-copy">先了解变更，再按需查看技术产物。</p></div><div class="panel-actions"><button id="continue-change" class="button primary" type="button">继续推进</button><button id="review-change" class="button secondary" type="button">交给智能体（Agent）审查</button></div></div></section><section class="metric-grid change-metrics"><article class="metric-card identity-card"><span>变更 ID</span><strong id="change-detail-code">—</strong><small id="change-detail-project">—</small></article><article class="metric-card"><span>生命周期</span><strong id="change-detail-lifecycle">—</strong><small id="change-detail-provenance">来自实际目录位置</small></article><article class="metric-card"><span>任务进度</span><strong id="change-detail-progress">—</strong><small id="change-detail-updated">—</small></article></section><section id="task-change-provenance" class="panel task-change-provenance hidden"><div class="panel-heading"><div><p class="eyebrow">任务范围解析器（Task-scoped Resolver）</p><h2>读取来源</h2></div><span class="state">只读</span></div><dl id="task-change-provenance-facts" class="read-facts"></dl></section><div id="change-brief"></div><section class="panel technical-artifacts-panel"><div class="panel-heading"><div><p class="eyebrow">深入技术细节</p><h2>OpenSpec 产物</h2></div><span class="state">只读</span></div><div id="change-artifacts" class="artifact-list"></div></section>`;
  try {
    const [workspace, data] = await Promise.all([api('/api/v1/workspace'), api(endpoint)]); onWorkspace(workspace);
    const resolution = taskScoped ? data.resolution : null;
    const change = taskScoped ? resolution.workingCopy.change : data.change;
    const provenance = resolution?.workingCopy?.provenance || (change.lifecycle === 'archived' ? 'retained-archive' : 'retained-active');
    document.getElementById('change-detail-name').textContent = change.name; document.getElementById('change-detail-copy').textContent = taskScoped ? `按任务 ${taskId} 的受信任执行根读取；页面不接收 文件系统路径（filesystem path）。` : `查看 ${change.project.name} 中的真实 OpenSpec 变更；页面不直接修改文件。`; onBreadcrumb(taskScoped ? ['任务', taskId, '变更', change.name] : ['项目', change.project.name, '变更', change.name]);
    document.getElementById('change-detail-code').textContent = change.code; document.getElementById('change-detail-project').textContent = `${change.project.name}（${change.project.code}）`;
    document.getElementById('change-detail-lifecycle').textContent = change.lifecycle === 'active' ? '进行中' : '已归档';
    document.getElementById('change-detail-provenance').textContent = provenance === 'task-environment-candidate' ? '任务环境候选' : provenance === 'retained-archive' ? '保留工作区（Retained）· 已归档' : '保留工作区（Retained）· 进行中';
    document.getElementById('change-detail-progress').textContent = change.progress.exists ? `${change.progress.completed} / ${change.progress.total}` : '未声明';
    document.getElementById('change-detail-updated').textContent = `更新于 ${new Date(change.updatedAt).toLocaleString('zh-CN')}`;
    if (taskScoped) {
      const panel = document.getElementById('task-change-provenance'); panel.classList.remove('hidden');
      const facts = document.getElementById('task-change-provenance-facts');
      const row = (label, value) => { const node = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; node.append(dt, dd); return node; };
      facts.append(row('工作副本（Working copy）', `${resolution.workingCopy.provenance} · ${resolution.workingCopy.root}`));
      facts.append(row('保留基线（Retained baseline）', resolution.retainedBaseline ? `${resolution.retainedBaseline.provenance} · ${resolution.retainedBaseline.root}` : '无独立保留基线'));
    }
    document.getElementById('change-brief').append(briefPanel(change.brief));
    const container = document.getElementById('change-artifacts'); container.append(artifactPanel('提案', change.artifacts.proposal), artifactPanel('设计', change.artifacts.design));
    for (const spec of change.artifacts.specs) container.append(artifactPanel(`规格 · ${spec.capability}`, spec));
    container.append(artifactPanel('任务', change.artifacts.tasks));
    const continueButton = document.getElementById('continue-change');
    continueButton.classList.toggle('hidden', taskScoped || change.lifecycle !== 'active');
    if (!taskScoped) continueButton.addEventListener('click', () => openAgentAction('change', { projectCode, ref: changeRef, action: 'continue' }));
    const reviewButton = document.getElementById('review-change');
    reviewButton.textContent = taskScoped ? '方案审查（Planning Review）' : '交给智能体（Agent）审查';
    reviewButton.addEventListener('click', () => taskScoped
      ? openAgentAction('task-review', { taskId, reviewType: 'planning', projectCode, change: change.code })
      : openAgentAction('change', { projectCode, ref: changeRef, action: 'review' }));
  } catch (error) { root.innerHTML = `<section class="page-header"><p class="eyebrow">变更</p><h1>变更不可用</h1><p class="page-copy"></p></section><a class="button secondary" href="${backPath}" data-route>返回${taskScoped ? '任务详情' : '变更目录'}</a>`; root.querySelector('.page-copy').textContent = error.message; }
}
