import fs from 'node:fs';
import path from 'node:path';
import { resolveSourceRoot } from '../../../workspace/domain/source-root.ts';

const PUBLICATION_ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const IMAGE_TYPES = new Map([
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

export const PUBLICATION_PLATFORM_ALIASES = Object.freeze({
  'buildr-web': 'buildr-web',
  'local-app': 'buildr-web',
});

export function canonicalPublicationPlatform(value) {
  return typeof value === 'string' ? (PUBLICATION_PLATFORM_ALIASES[value] || value) : value;
}

export function publicationError(code, message, status = 400, details = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

function inside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function regularFile(file) {
  try {
    return fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
}

function directory(file) {
  try {
    return fs.lstatSync(file).isDirectory();
  } catch {
    return false;
  }
}

function safePathSegments(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath) || relativePath.includes('\\')) {
    throw publicationError('publication_asset_invalid', '文章资源路径不合法。');
  }
  const segments = relativePath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw publicationError('publication_asset_invalid', '文章资源路径不允许路径穿越。');
  }
  let current = path.resolve(root);
  for (const segment of segments) {
    current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); } catch { throw publicationError('publication_asset_not_found', '文章资源不存在。', 404); }
    if (stat.isSymbolicLink()) throw publicationError('publication_asset_forbidden', '文章资源不允许使用符号链接。', 400);
  }
  if (!inside(root, current) || !regularFile(current)) throw publicationError('publication_asset_not_found', '文章资源不存在。', 404);
  return current;
}

function parseArticle(file, publicationRoot, runtime) {
  let source;
  try { source = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  let metadata;
  try { metadata = runtime.parseYamlDocument(match[1], `publication front matter: ${file}`); } catch { return null; }
  if (typeof metadata.id !== 'string' || !PUBLICATION_ID.test(metadata.id) || typeof metadata.title !== 'string' || !metadata.title.trim()) return null;
  const targets = Array.isArray(metadata.targets)
    ? metadata.targets.filter((target) => target && typeof target === 'object' && typeof target.platform === 'string' && typeof target.status === 'string').map((target) => ({ platform: canonicalPublicationPlatform(target.platform), status: target.status, ...(typeof target.url === 'string' ? { url: target.url } : {}) }))
    : [];
  return {
    id: metadata.id,
    title: metadata.title.trim(),
    kind: typeof metadata.kind === 'string' ? metadata.kind : 'article',
    status: typeof metadata.status === 'string' ? metadata.status : 'draft',
    publishedAt: typeof metadata.published_at === 'string' ? metadata.published_at : null,
    targets,
    sourcePath: path.relative(publicationRoot, file).split(path.sep).join('/'),
    file,
    source,
    content: source.slice(match[0].length),
  };
}

export function registerPublicationApplication(runtime, { projectQuery } = {}) {
  if (!projectQuery || typeof projectQuery.readProjectRegistryRecord !== 'function') {
    const error = new Error('Publication Application requires the Project Query capability.');
    error.code = 'publication_project_query_missing';
    throw error;
  }
  function publicationRoot(targetRoot) {
    const record = projectQuery.readProjectRegistryRecord(targetRoot);
    const project = record.projects.product;
    if (!project) throw publicationError('publication_project_not_found', 'Product Project 尚未登记。', 404);
    const projectRoot = resolveSourceRoot(record.root, project.source);
    if (!inside(record.root, projectRoot) || project.source.type !== 'workspace') throw publicationError('publication_project_boundary', 'Product Project 不在当前 Workspace 的受控范围内。', 409);
    return path.join(projectRoot, 'docs', 'publications');
  }

  function readEntries(targetRoot) {
    const root = publicationRoot(targetRoot);
    if (!directory(root)) return { root, entries: [] };
    const entries = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.toLowerCase().endsWith('.md') && !entry.name.startsWith('.'))
      .map((entry) => parseArticle(path.join(root, entry.name), root, runtime))
      .filter(Boolean)
      .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
    return { root, entries };
  }

  function publicArticle(article) {
    return {
      id: article.id,
      title: article.title,
      kind: article.kind,
      status: article.status,
      publishedAt: article.publishedAt,
      targets: article.targets,
      sourcePath: article.sourcePath,
    };
  }

  function listPublications(targetRoot) {
    const { entries } = readEntries(targetRoot);
    return { schemaVersion: 'buildr.publications/v1', publications: entries.map(publicArticle), empty: entries.length === 0 };
  }

  function publicationDetail(targetRoot, id) {
    if (typeof id !== 'string' || !PUBLICATION_ID.test(id)) throw publicationError('publication_reference_invalid', '文章 ID 不合法。');
    const { entries } = readEntries(targetRoot);
    const article = entries.find((entry) => entry.id === id);
    if (!article) throw publicationError('publication_not_found', `文章不存在：${id}。`, 404);
    return { schemaVersion: 'buildr.publication-detail/v1', publication: publicArticle(article), content: article.content, source: article.source };
  }

  function readPublicationAsset(targetRoot, id, assetPath) {
    if (typeof id !== 'string' || !PUBLICATION_ID.test(id)) throw publicationError('publication_reference_invalid', '文章 ID 不合法。');
    const { root, entries } = readEntries(targetRoot);
    if (!entries.some((entry) => entry.id === id)) throw publicationError('publication_not_found', `文章不存在：${id}。`, 404);
    if (!assetPath.startsWith('assets/')) throw publicationError('publication_asset_forbidden', '文章资源必须位于 assets 目录。');
    const file = safePathSegments(root, assetPath);
    const extension = path.extname(file).toLowerCase();
    const contentType = IMAGE_TYPES.get(extension);
    if (!contentType) throw publicationError('publication_asset_type_forbidden', '文章资源只允许受控图片类型。');
    return { file, contentType };
  }

  Object.assign(runtime, { publicationRoot, listPublications, publicationDetail, readPublicationAsset });
  return runtime;
}
