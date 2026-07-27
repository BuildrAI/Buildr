import { renderMarkdown } from '../markdown.js';

function artifactPanel(label, artifact) {
  const article = document.createElement('article'); article.className = 'artifact-panel';
  const heading = document.createElement('div'); heading.className = 'artifact-heading';
  const title = document.createElement('strong'); title.textContent = label;
  const path = document.createElement('small'); path.textContent = artifact.path;
  heading.append(title, path); article.append(heading);
  if (artifact.exists) {
    const content = renderMarkdown(artifact.content);
    content.classList.add('artifact-content');
    article.append(content);
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
  const content = renderMarkdown(brief.content);
  content.classList.add('brief-content');
  const source = document.createElement('small'); source.className = 'brief-source'; source.textContent = brief.path;
  section.append(content, source); return section;
}

export async function renderChangeDetail({ root, api, onWorkspace, onBreadcrumb, openAgentAction, params }) {
  const { projectCode, changeRef } = params;
  root.innerHTML = `<section class="page-header change-detail-header"><a class="back-link" href="/changes" data-route>← 返回变更目录</a><div class="page-header-row"><div><p class="eyebrow">变更</p><h1 id="change-detail-name">正在读取…</h1><p id="change-detail-copy" class="page-copy">先了解变更，再按需查看技术产物。</p></div><div class="panel-actions"><button id="continue-change" class="button primary" type="button">继续推进</button><button id="review-change" class="button secondary" type="button">交给 Agent 审查</button></div></div></section><section class="metric-grid change-metrics"><article class="metric-card identity-card"><span>变更 ID</span><strong id="change-detail-code">—</strong><small id="change-detail-project">—</small></article><article class="metric-card"><span>生命周期</span><strong id="change-detail-lifecycle">—</strong><small>来自实际目录位置</small></article><article class="metric-card"><span>任务进度</span><strong id="change-detail-progress">—</strong><small id="change-detail-updated">—</small></article></section><div id="change-brief"></div><section class="panel technical-artifacts-panel"><div class="panel-heading"><div><p class="eyebrow">深入技术细节</p><h2>OpenSpec 产物</h2></div><span class="state">只读</span></div><div id="change-artifacts" class="artifact-list"></div></section>`;
  try {
    const [workspace, data] = await Promise.all([api('/api/v1/workspace'), api(`/api/v1/projects/${encodeURIComponent(projectCode)}/changes/${encodeURIComponent(changeRef)}`)]); onWorkspace(workspace);
    const change = data.change;
    document.getElementById('change-detail-name').textContent = change.name; document.getElementById('change-detail-copy').textContent = `查看 ${change.project.name} 中的真实 OpenSpec 变更；页面不直接修改文件。`; onBreadcrumb(['项目', change.project.name, '变更', change.name]);
    document.getElementById('change-detail-code').textContent = change.code; document.getElementById('change-detail-project').textContent = `${change.project.name}（${change.project.code}）`;
    document.getElementById('change-detail-lifecycle').textContent = change.lifecycle === 'active' ? '进行中' : '已归档';
    document.getElementById('change-detail-progress').textContent = change.progress.exists ? `${change.progress.completed} / ${change.progress.total}` : '未声明';
    document.getElementById('change-detail-updated').textContent = `更新于 ${new Date(change.updatedAt).toLocaleString('zh-CN')}`;
    document.getElementById('change-brief').append(briefPanel(change.brief));
    const container = document.getElementById('change-artifacts'); container.append(artifactPanel('提案', change.artifacts.proposal), artifactPanel('设计', change.artifacts.design));
    for (const spec of change.artifacts.specs) container.append(artifactPanel(`规格 · ${spec.capability}`, spec));
    container.append(artifactPanel('任务', change.artifacts.tasks));
    const continueButton = document.getElementById('continue-change'); continueButton.classList.toggle('hidden', change.lifecycle !== 'active'); continueButton.addEventListener('click', () => openAgentAction('change', { projectCode, ref: changeRef, action: 'continue' }));
    document.getElementById('review-change').addEventListener('click', () => openAgentAction('change', { projectCode, ref: changeRef, action: 'review' }));
  } catch (error) { root.innerHTML = `<section class="page-header"><p class="eyebrow">变更</p><h1>变更不存在</h1><p class="page-copy"></p></section><a class="button secondary" href="/changes" data-route>返回变更目录</a>`; root.querySelector('.page-copy').textContent = error.message; }
}
