import type { Publication, PublicationAsset, PublicationDraft } from './api/publication-api';

export const publicationStatus: Record<string, string> = { draft: '草稿', planned: '待发布', published: '已发布' };
export const publicationPlatform: Record<string, string> = { mowen: '墨问', wechat: '微信公众号', 'buildr-web': 'Buildr Web', 'local-app': 'Buildr Web' };
export const articleResourceKey = (article: Pick<Publication, 'id' | 'projectCode'>) => article.projectCode === 'product' ? `article:${article.id}` : `article:${article.projectCode}:${article.id}`;
export const articlePath = (article: Pick<Publication, 'id' | 'projectCode'>) => `/articles/${encodeURIComponent(article.projectCode)}/${encodeURIComponent(article.id)}`;
export function publicationAssetPath(value: string): string | null {
  let path: string;
  try { path = decodeURIComponent(value); } catch { return null; }
  if (!path.startsWith('assets/') || /[\\\u0000-\u001f?#]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return path;
}
export function publicationAssetUrl(workspaceId: string, projectCode: string, id: string, value: string): string | null {
  const path = publicationAssetPath(value);
  return path ? `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectCode)}/publications/${encodeURIComponent(id)}/assets/${encodeURIComponent(path)}` : null;
}
export function referencedAssets(content: string): string[] {
  return [...new Set([...content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map(match => publicationAssetPath(match[1])).filter((path): path is string => Boolean(path)))];
}
export function assetMarkdown(asset: PublicationAsset): string {
  const name = asset.name.replace(/[\[\]\\\r\n]/g, '');
  const path = asset.relativePath.split('/').map(encodeURIComponent).join('/');
  return `${asset.isImage ? '!' : ''}[${name}](${path})`;
}
export function insertMarkdown(content: string, text: string, start: number, end = start) {
  const position = Math.min(content.length, Math.max(0, start));
  const before = content.slice(0, position), after = content.slice(Math.max(position, end));
  const inserted = `${before && !before.endsWith('\n') ? '\n\n' : ''}${text}${after ? (after.startsWith('\n') ? '' : '\n\n') : '\n'}`;
  return { content: before + inserted + after, cursor: before.length + inserted.length };
}
export function selectPublications(articles: Publication[], filters: { query: string; project: string; status: string; sort: string; saved: boolean }, isSaved: (key: string) => boolean): Publication[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return articles.filter(article => (!filters.project || article.projectCode === filters.project)
    && (!filters.status || article.status === filters.status)
    && (!filters.saved || isSaved(articleResourceKey(article)))
    && (!query || `${article.title} ${article.summary || ''}`.toLocaleLowerCase().includes(query)))
    .sort((left, right) => filters.sort === 'title' ? left.title.localeCompare(right.title, 'zh-CN') : (right.updatedAt || right.publishedAt || '').localeCompare(left.updatedAt || left.publishedAt || ''));
}
export function articleDraft(article: { publication: Publication; content: string }): PublicationDraft {
  return { title: article.publication.title, summary: article.publication.summary || '', status: article.publication.status, content: article.content };
}
export const displayArticleDate = (date?: string | null) => date ? new Date(date).toLocaleDateString('zh-CN') : '未设置日期';
export const readingContent = (content: string) => content.replace(/^# [^\n]*\n\s*/, '');
export function downloadMarkdown(source: string, filename: string) {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const writingMethods = [
  { value: '起草文章', description: '从目标和素材开始' },
  { value: '润色表达', description: '结构与表达更清楚' },
  { value: '审校内容', description: '检查事实与论证' },
  { value: '改写平台版', description: '适配读者与篇幅' },
];
export function buildWritingRequest(input: { projectCode: string; projectName: string; method: string; goal: string; materials: string; article?: Publication; revision?: string; hasUnsavedChanges?: boolean }): string {
  if (!input.projectCode) throw new Error('请先选择所属项目');
  if (!input.goal.trim()) throw new Error('请先写下文章目标');
  const article = input.article;
  return [
    `请协助${input.method}。`, `所属项目：${input.projectName}（${input.projectCode}）`,
    ...(article ? [`文章：${article.title}`, `文章标识：${article.id}`, `项目内来源：docs/publications/${article.sourcePath}`, `已观察版本：${input.revision || article.revision}`, '请按项目登记定位当前文件，先读取真实稿件并核对版本，保留已有修改和平台记录。'] : ['请按项目登记定位 docs/publications/，创建文章草稿。']),
    ...(input.hasUnsavedChanges ? ['浏览器中还有未保存修改；本请求不包含这些修改，请先与用户核对后接续，不要覆盖。'] : []),
    `目标：${input.goal.trim()}`, `参考材料：${input.materials.trim() || '使用当前项目内可核实的资料'}`,
    '根据目标选择已安装且适用的技能（Skill），核实事实、引用与图片附件。图片和附件放在项目 docs/publications/assets/，使用相对路径引用。',
    '完成后说明实际修改、资源引用和仍待核实的问题。外部平台发布需要另行明确内容与平台。',
    '生成或复制本请求不代表已执行；请完成实际文件修改后再报告结果。',
  ].join('\n');
}
