function text(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

const statusLabel = { published: '已发布', planned: '待发布', draft: '草稿' };
const platformLabel = { mowen: '墨问', wechat: '微信公众号', 'local-app': 'Local App' };

function targetText(target) {
  const label = platformLabel[target.platform] || target.platform;
  return `${label} · ${statusLabel[target.status] || target.status}`;
}

export async function renderPublications({ root, api, onWorkspace }) {
  root.innerHTML = `<section class="resource-toolbar"><div><p class="eyebrow">文章</p><h1>对外发布材料</h1><p class="page-copy">项目内维护的文章源；Local App 只读展示，不在这里编辑或发布。</p></div><div class="toolbar-actions"><span id="publications-state" class="count-label">正在读取</span></div></section><section class="resource-list-section"><div class="section-heading"><div><h2>文章目录</h2><p class="section-copy">正文与配图来自 Product Project 的 docs/publications/。</p></div></div><div id="publications-list" class="publication-list"></div><div id="publications-empty" class="empty-state hidden"><h2>暂无文章</h2><p>当前 Product Project 还没有有效的对外文章材料。</p></div></section>`;
  try {
    const [workspace, data] = await Promise.all([api('/api/v1/workspace'), api('/api/v1/publications')]);
    onWorkspace(workspace);
    text('publications-state', `${data.publications.length} 篇文章`);
    const list = document.getElementById('publications-list');
    document.getElementById('publications-empty').classList.toggle('hidden', !data.empty);
    for (const publication of data.publications) {
      const card = document.createElement('article'); card.className = 'publication-card';
      const heading = document.createElement('div'); heading.className = 'publication-card-heading';
      const title = document.createElement('h3');
      const link = document.createElement('a'); link.href = `/articles/${encodeURIComponent(publication.id)}`; link.dataset.route = ''; link.textContent = publication.title;
      title.append(link); heading.append(title);
      const status = document.createElement('span'); status.className = `state publication-status ${publication.status}`; status.textContent = statusLabel[publication.status] || publication.status; heading.append(status);
      const meta = document.createElement('p'); meta.className = 'publication-meta'; meta.textContent = `${publication.kind} · ${publication.publishedAt || '未设置日期'}`;
      const targets = document.createElement('div'); targets.className = 'publication-targets';
      for (const target of publication.targets) { const item = document.createElement('span'); item.textContent = targetText(target); targets.append(item); }
      card.append(heading, meta, targets); list.append(card);
    }
  } catch (error) {
    text('publications-state', '读取失败');
    const empty = document.getElementById('publications-empty'); empty.classList.remove('hidden'); empty.querySelector('h2').textContent = '文章不可用'; empty.querySelector('p').textContent = error.message;
  }
}
