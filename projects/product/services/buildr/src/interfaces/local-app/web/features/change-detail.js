import { renderMarkdown } from '/markdown.js';

function contentView(raw, contentClass) {
  const view = renderMarkdown(raw, { headingOffset: 1, allowRelativeLinks: true });
  view.classList.add(contentClass, 'markdown-body');
  return view;
}

function artifactPanel(label, artifact) {
  const article = document.createElement('article'); article.className = 'artifact-panel';
  const heading = document.createElement('div'); heading.className = 'artifact-heading';
  const title = document.createElement('strong'); title.textContent = label;
  const path = document.createElement('small'); path.textContent = artifact.path;
  heading.append(title, path); article.append(heading);
  if (artifact.exists) article.append(contentView(artifact.content, 'artifact-content'));
  else { const missing = document.createElement('p'); missing.className = 'artifact-missing'; missing.textContent = '未声明'; article.append(missing); }
  return article;
}

export function changeBriefPanel(change) {
  const section = document.createElement('section'); section.className = 'panel change-brief-panel';
  const heading = document.createElement('div'); heading.className = 'panel-heading';
  const copy = document.createElement('div');
  const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = '关联变更';
  const title = document.createElement('h2'); title.textContent = change.name;
  copy.append(eyebrow, title);
  const state = document.createElement('span'); state.className = 'state'; state.textContent = change.brief.exists ? 'Brief' : 'Brief 未提供';
  heading.append(copy, state); section.append(heading);
  if (change.brief.exists) section.append(contentView(change.brief.content, 'brief-content'));
  else { const message = document.createElement('p'); message.className = 'brief-missing'; message.textContent = `没有可读取的 Brief：${change.brief.path}`; section.append(message); }
  return section;
}

export async function renderChangeDetail({ root, api, onWorkspace, onBreadcrumb, params }) {
  const { taskId, projectCode, changeCode } = params;
  const backPath = `/tasks/${encodeURIComponent(taskId)}`;
  root.innerHTML = `<section class="page-header change-detail-header"><a class="back-link" href="${backPath}" data-route>← 返回任务详情</a><div class="page-header-row"><div><p class="eyebrow">任务关联变更</p><h1 id="change-detail-name">正在读取…</h1><p class="page-copy">只读展示当前任务已关联的 OpenSpec 内容。</p></div></div></section><section id="task-change-provenance" class="panel task-change-provenance"><div class="panel-heading"><div><h2>读取来源</h2></div><span class="state">只读</span></div><dl id="task-change-provenance-facts" class="read-facts"></dl></section><div id="change-brief"></div><section class="panel technical-artifacts-panel"><div class="panel-heading"><div><p class="eyebrow">深入技术细节</p><h2>OpenSpec 产物</h2></div><span class="state">只读</span></div><div id="change-artifacts" class="artifact-list"></div></section>`;
  try {
    const [workspace, data] = await Promise.all([api('/api/v1/workspace'), api(`/api/v1/tasks/${encodeURIComponent(taskId)}/changes/${encodeURIComponent(projectCode)}/${encodeURIComponent(changeCode)}`)]); onWorkspace(workspace);
    const { resolution } = data; const change = resolution.workingCopy.change;
    onBreadcrumb(['任务', taskId, '变更', change.name]); document.getElementById('change-detail-name').textContent = change.name;
    const facts = document.getElementById('task-change-provenance-facts');
    for (const [label, value] of [['工作副本', `${resolution.workingCopy.provenance} · ${resolution.workingCopy.root}`], ['保留基线', resolution.retainedBaseline ? `${resolution.retainedBaseline.provenance} · ${resolution.retainedBaseline.root}` : '无独立保留基线']]) { const row = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; row.append(dt, dd); facts.append(row); }
    document.getElementById('change-brief').append(changeBriefPanel(change));
    const artifacts = document.getElementById('change-artifacts'); artifacts.append(artifactPanel('提案', change.artifacts.proposal), artifactPanel('设计', change.artifacts.design));
    for (const spec of change.artifacts.specs) artifacts.append(artifactPanel(`规格 · ${spec.capability}`, spec));
    artifacts.append(artifactPanel('任务', change.artifacts.tasks));
  } catch (error) { root.innerHTML = `<section class="page-header"><p class="eyebrow">任务关联变更</p><h1>变更不可用</h1><p class="page-copy"></p></section><a class="button secondary" href="${backPath}" data-route>返回任务详情</a>`; root.querySelector('.page-copy').textContent = error.message; }
}
