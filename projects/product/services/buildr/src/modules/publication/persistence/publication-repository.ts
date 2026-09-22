import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { canonicalPublicationPlatform, PUBLICATION_ASSET_TYPES, PUBLICATION_ID, publicationError } from '../domain/publication.ts';

export type PublicationScope = { workspaceRoot: string; root: string; projectCode: string; projectName: string };

export function inside(parent: string, child: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

/** Check every existing segment, including dangling links. Missing descendants are allowed for creation. */
export function safePublicationPath(scope: PublicationScope, file: string) {
  if (!inside(scope.workspaceRoot, file) || !inside(scope.root, file)) throw publicationError('publication_asset_forbidden', '文章路径超出所属项目。');
  let current = path.resolve(scope.workspaceRoot);
  const segments = path.relative(current, file).split(path.sep).filter(Boolean);
  for (const segment of ['', ...segments]) {
    current = segment ? path.join(current, segment) : current;
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error: any) {
      if (error.code === 'ENOENT') continue;
      throw publicationError('publication_source_unavailable', '文章来源暂时不可读取。', 409);
    }
    if (stat.isSymbolicLink()) throw publicationError('publication_asset_forbidden', '文章及资源目录不允许使用符号链接。');
    if (current !== file && !stat.isDirectory()) throw publicationError('publication_source_unavailable', '文章来源目录不可读取。', 409);
  }
  return file;
}

function statOrNull(file: string) {
  try { return fs.lstatSync(file); }
  catch (error: any) { if (error.code === 'ENOENT') return null; throw error; }
}

export function readPublicationFile(scope: PublicationScope, file: string) {
  safePublicationPath(scope, file);
  const stat = statOrNull(file);
  if (!stat?.isFile()) return null;
  const bytes = fs.readFileSync(file);
  const source = bytes.toString('utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  const document = YAML.parseDocument(match[1]);
  if (document.errors.length) return null;
  let metadata: any;
  try { metadata = document.toJS(); } catch { return null; }
  if (!metadata || typeof metadata !== 'object' || typeof metadata.id !== 'string' || !PUBLICATION_ID.test(metadata.id) || typeof metadata.title !== 'string' || !metadata.title.trim()) return null;
  const targets = Array.isArray(metadata.targets)
    ? metadata.targets.filter((target: any) => target && typeof target === 'object' && typeof target.platform === 'string' && typeof target.status === 'string')
      .map((target: any) => ({ platform: canonicalPublicationPlatform(target.platform), status: target.status, ...(typeof target.url === 'string' && target.url ? { url: target.url } : {}) }))
    : [];
  return {
    id: metadata.id, title: metadata.title.trim(), summary: typeof metadata.summary === 'string' ? metadata.summary : '',
    kind: typeof metadata.kind === 'string' && metadata.kind ? metadata.kind : 'article',
    status: typeof metadata.status === 'string' && metadata.status ? metadata.status : 'draft',
    publishedAt: typeof metadata.published_at === 'string' ? metadata.published_at : null,
    projectCode: scope.projectCode, projectName: scope.projectName,
    targets, updatedAt: stat.mtime.toISOString(), revision: `sha256-${crypto.createHash('sha256').update(bytes).digest('hex')}`,
    sourcePath: path.relative(scope.root, file).split(path.sep).join('/'),
    file, document, source, content: source.slice(match[0].length),
  };
}

export type PublicationRecord = NonNullable<ReturnType<typeof readPublicationFile>>;

export function publicPublication(article: PublicationRecord) {
  const { file: _file, document: _document, source: _source, content: _content, ...publication } = article;
  return publication;
}

export function readPublicationEntries(scope: PublicationScope, options: { strict?: boolean; diagnostics?: { code: string; message: string }[] } = {}) {
  safePublicationPath(scope, scope.root);
  const stat = statOrNull(scope.root);
  if (!stat) return [];
  if (!stat.isDirectory()) throw publicationError('publication_source_unavailable', '文章来源不是目录。', 409);
  return fs.readdirSync(scope.root, { withFileTypes: true })
    .filter(entry => entry.isFile() && !entry.name.startsWith('.') && entry.name.toLowerCase().endsWith('.md') && entry.name.toLowerCase() !== 'readme.md')
    .map(entry => {
      try { return readPublicationFile(scope, path.join(scope.root, entry.name)); }
      catch {
        const error = publicationError('publication_source_unavailable', `文章文件暂时不可读取：${entry.name}。`, 409);
        if (options.strict) throw error;
        options.diagnostics?.push({ code: error.code, message: error.message });
        return null;
      }
    })
    .filter((entry): entry is PublicationRecord => entry !== null);
}

export function publicationAsset(scope: PublicationScope, relativePath: string) {
  if (typeof relativePath !== 'string' || !relativePath.startsWith('assets/') || relativePath.includes('\\') || /[\u0000-\u001f\u007f]/.test(relativePath)) throw publicationError('publication_asset_forbidden', '文章资源必须位于 assets 目录。');
  if (relativePath.split('/').some(segment => !segment || segment === '.' || segment === '..')) throw publicationError('publication_asset_invalid', '文章资源路径不允许路径穿越。');
  const file = safePublicationPath(scope, path.join(scope.root, relativePath));
  const stat = statOrNull(file);
  if (!stat?.isFile()) throw publicationError('publication_asset_not_found', '文章资源不存在。', 404);
  const contentType = PUBLICATION_ASSET_TYPES[path.extname(file).toLowerCase()];
  if (!contentType) throw publicationError('publication_asset_type_forbidden', '文章资源类型不受支持。');
  return { file, name: path.basename(file), relativePath, contentType, size: stat.size, isImage: contentType.startsWith('image/') };
}

export function publicPublicationAsset(asset: ReturnType<typeof publicationAsset>) {
  const { file: _file, ...value } = asset;
  return value;
}

export function listPublicationAssets(scope: PublicationScope) {
  const assetsRoot = safePublicationPath(scope, path.join(scope.root, 'assets'));
  if (!statOrNull(assetsRoot)?.isDirectory()) return [];
  const assets: ReturnType<typeof publicPublicationAsset>[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const file = safePublicationPath(scope, path.join(directory, entry.name));
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && PUBLICATION_ASSET_TYPES[path.extname(entry.name).toLowerCase()]) assets.push(publicPublicationAsset(publicationAsset(scope, path.relative(scope.root, file).split(path.sep).join('/'))));
    }
  };
  visit(assetsRoot);
  return assets.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'zh-CN'));
}

export function renderPublicationUpdate(article: PublicationRecord, input: { title: string; summary: string; status: string; content: string }) {
  for (const key of ['title', 'summary', 'status'] as const) article.document.set(key, input[key]);
  article.document.set('updated_at', new Date().toISOString());
  return `---\n${article.document.toString()}---\n${input.content.replace(/\n*$/, '')}\n`;
}

export function renderNewPublication(id: string, input: { title: string; summary: string; status: string; content: string }) {
  const { content, ...metadata } = input;
  return `---\n${YAML.stringify({ id, ...metadata, kind: 'article', updated_at: new Date().toISOString(), targets: [] })}---\n${content.replace(/\n*$/, '')}\n`;
}
