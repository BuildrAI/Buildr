import { renderMarkdown } from '/markdown.js';

const statusLabel = { published: '已发布', planned: '待发布', draft: '草稿' };
const platformLabel = { mowen: '墨问', wechat: '微信公众号', 'local-app': 'Local App' };

function contentView(raw, publicationId, workspaceId) {
  const wrap = document.createElement('div'); wrap.className = 'content-view';
  const toggle = document.createElement('div'); toggle.className = 'content-view-toggle'; toggle.setAttribute('role', 'group'); toggle.setAttribute('aria-label', '内容视图');
  const renderedButton = document.createElement('button'); renderedButton.type = 'button'; renderedButton.className = 'content-view-option is-active'; renderedButton.setAttribute('aria-pressed', 'true'); renderedButton.textContent = '渲染';
  const sourceButton = document.createElement('button'); sourceButton.type = 'button'; sourceButton.className = 'content-view-option'; sourceButton.setAttribute('aria-pressed', 'false'); sourceButton.textContent = '原文';
  toggle.append(renderedButton, sourceButton);
  const rendered = renderMarkdown(raw, {
    headingOffset: 1,
    allowRelativeLinks: true,
    imageResolver(href) {
      if (!/^assets\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(href) || href.includes('..') || href.includes('\\')) return null;
      return { href: `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/publications/${encodeURIComponent(publicationId)}/assets/${href.split('/').map(encodeURIComponent).join('/')}` };
    },
  });
  rendered.classList.add('publication-content', 'content-view-pane', 'is-active'); rendered.setAttribute('data-view', 'rendered');
  const source = document.createElement('pre'); source.className = 'publication-content content-view-pane content-view-source'; source.setAttribute('data-view', 'source'); source.hidden = true; source.textContent = String(raw ?? '');
  function setView(mode) {
    const renderedMode = mode === 'rendered';
    renderedButton.classList.toggle('is-active', renderedMode); sourceButton.classList.toggle('is-active', !renderedMode); renderedButton.setAttribute('aria-pressed', String(renderedMode)); sourceButton.setAttribute('aria-pressed', String(!renderedMode)); rendered.hidden = !renderedMode; source.hidden = renderedMode;
  }
  renderedButton.addEventListener('click', () => setView('rendered')); sourceButton.addEventListener('click', () => setView('source')); wrap.append(toggle, rendered, source); return wrap;
}

export async function renderPublicationDetail({ root, api, onWorkspace, onBreadcrumb, params }) {
  const id = params.publicationId;
  root.innerHTML = `<section class="page-header publication-detail-header"><a class="back-link" href="/articles" data-route>← 返回文章目录</a><div class="page-header-row"><div><p class="eyebrow">文章</p><h1 id="publication-title">正在读取…</h1><p id="publication-copy" class="page-copy">项目内文章源，只读展示。</p></div><span id="publication-status" class="state">—</span></div></section><section class="panel publication-target-panel"><div class="panel-heading"><div><p class="eyebrow">发布目标</p><h2>平台状态</h2></div><span class="state">只读</span></div><div id="publication-targets" class="publication-targets"></div></section><section id="publication-content-panel" class="panel publication-content-panel"></section>`;
  try {
    const [workspace, data] = await Promise.all([api('/api/v1/workspace'), api(`/api/v1/publications/${encodeURIComponent(id)}`)]);
    onWorkspace(workspace);
    const publication = data.publication;
    document.getElementById('publication-title').textContent = publication.title;
    document.getElementById('publication-copy').textContent = `${publication.kind} · ${publication.publishedAt || '未设置发布日期'} · ${publication.sourcePath}`;
    const status = document.getElementById('publication-status'); status.textContent = statusLabel[publication.status] || publication.status; status.className = `state publication-status ${publication.status}`;
    onBreadcrumb?.(['文章', publication.title]);
    const targets = document.getElementById('publication-targets');
    for (const target of publication.targets) { const item = document.createElement(target.url ? 'a' : 'span'); item.textContent = `${platformLabel[target.platform] || target.platform} · ${statusLabel[target.status] || target.status}`; if (target.url) { item.href = target.url; item.target = '_blank'; item.rel = 'noopener noreferrer'; } targets.append(item); }
    document.getElementById('publication-content-panel').append(contentView(data.content, publication.id, workspace.workspace.id));
  } catch (error) {
    root.innerHTML = `<section class="page-header"><p class="eyebrow">文章</p><h1>文章不可用</h1><p class="page-copy"></p></section><a class="button secondary" href="/articles" data-route>返回文章目录</a>`;
    root.querySelector('.page-copy').textContent = error.message;
  }
}
