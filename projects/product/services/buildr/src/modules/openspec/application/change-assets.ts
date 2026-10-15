import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertMarkdownImageSourceRoot, readDocumentImage } from '../../../infrastructure/filesystem/markdown-images.ts';
import { readVerifiedReadonlyBytes } from '../../../infrastructure/filesystem/verified-readonly-file.ts';

export type ChangeAssetKind = 'markdown' | 'text' | 'image' | 'unsupported';
export type ChangeAsset = { path: string; relativePath: string; name: string; kind: ChangeAssetKind; sizeBytes: number; updatedAt: string; sourceIdentity: string };
export type ChangeAssetDiagnostic = { code: string; message: string; path?: string };
const MAX_DEPTH = 8;
const MAX_ENTRIES = 2000;
const MAX_ASSETS = 500;
const MAX_TEXT_BYTES = 512 * 1024;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const TEXT_EXTENSIONS = new Set(['.txt', '.sql', '.yaml', '.yml', '.json', '.jsonc', '.toml', '.xml', '.svg', '.ini', '.conf', '.config', '.properties', '.log', '.csv', '.tsv', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.scss', '.html', '.htm', '.vue', '.svelte', '.py', '.java', '.kt', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.r', '.swift', '.lock', '.diff', '.patch', '.env', '.example', '.rst', '.adoc']);
const digest = (bytes: string | Uint8Array) => `sha256-${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const failure = (code: string, message: string, status = 400) => Object.assign(new Error(message), { code, status });
const relative = (root: string, file: string) => path.relative(root, file).split(path.sep).join('/');

function assetPath(value: string): string {
  if (!value || value.length > 1024 || value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw failure('task_change_asset_path_forbidden', '资料路径必须是变更内的普通相对路径。');
  return value;
}

function extraFile(value: string): boolean {
  return path.posix.basename(value) !== '.DS_Store' && !['.openspec.yaml', 'proposal.md', 'design.md', 'tasks.md'].includes(value) && !/^specs\/[^/]+\/spec\.md$/.test(value);
}

function assetKind(value: string): ChangeAssetKind {
  const extension = path.posix.extname(value).toLowerCase();
  if (extension === '.md' || extension === '.markdown') return 'markdown';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  return TEXT_EXTENSIONS.has(extension) || /^(?:Dockerfile|Makefile|LICENSE|NOTICE|README|\.gitignore|\.npmrc|\.editorconfig)$/i.test(path.posix.basename(value)) ? 'text' : 'unsupported';
}

function plainFile(changeRoot: string, value: string): { file: string; entry: fs.Stats; root: fs.Stats } {
  assetPath(value);
  const root = fs.lstatSync(changeRoot);
  if (!root.isDirectory() || root.isSymbolicLink()) throw failure('task_change_asset_path_forbidden', '资料来源必须是普通变更目录。');
  let file = changeRoot;
  const parts = value.split('/');
  let entry = root;
  for (const [index, part] of parts.entries()) {
    file = path.join(file, part);
    entry = fs.lstatSync(file);
    if (entry.isSymbolicLink() || (index < parts.length - 1 && !entry.isDirectory())) throw failure('task_change_asset_path_forbidden', '资料不能通过符号链接或非普通目录读取。');
  }
  if (!entry.isFile()) throw failure('task_change_asset_path_forbidden', '资料必须是普通文件。');
  return { file, entry, root };
}

export function inspectChangeAsset(changeRoot: string, value: string, pathBase: string): ChangeAsset {
  if (!extraFile(assetPath(value))) throw failure('task_change_asset_path_forbidden', '标准方案文档与机器元数据请从原有入口读取。');
  const { file, entry, root } = plainFile(changeRoot, value);
  return { path: relative(pathBase, file), relativePath: value, name: path.posix.basename(value), kind: assetKind(value), sizeBytes: entry.size, updatedAt: entry.mtime.toISOString(), sourceIdentity: digest(JSON.stringify(['change-asset', fs.realpathSync(changeRoot), root.dev, root.ino, value, entry.dev, entry.ino])) };
}

/** Index metadata only. The selected body is read separately under the observed source identity. */
export function discoverChangeAssets(changeRoot: string, projectRoot: string, pathBase: string): { assets: ChangeAsset[]; assetDiagnostics: ChangeAssetDiagnostic[] } {
  const assets: ChangeAsset[] = [], assetDiagnostics: ChangeAssetDiagnostic[] = [];
  let visited = 0, stopped = false;
  const diagnostic = (code: string, message: string, file?: string) => assetDiagnostics.push({ code, message, ...(file ? { path: file } : {}) });
  try { assertMarkdownImageSourceRoot(projectRoot, changeRoot); }
  catch { return { assets, assetDiagnostics: [{ code: 'change_asset_root_unavailable', message: '交付资料目录当前不可安全读取。' }] }; }

  function visit(directory: string, depth: number) {
    if (depth > MAX_DEPTH) { diagnostic('change_asset_depth_limit', `资料目录超过 ${MAX_DEPTH} 层，已跳过更深目录。`, relative(changeRoot, directory)); return; }
    let opened: fs.Dir;
    try { opened = fs.opendirSync(directory); }
    catch { diagnostic('change_asset_directory_unreadable', '资料目录当前不可读取。', relative(changeRoot, directory)); return; }
    try {
      let entry: fs.Dirent | null;
      while (!stopped && (entry = opened.readSync())) {
        visited += 1;
        if (visited > MAX_ENTRIES || assets.length >= MAX_ASSETS) { diagnostic('change_asset_count_limit', `资料索引达到 ${MAX_ASSETS} 个文件或 ${MAX_ENTRIES} 个目录项的限制，其余内容已跳过。`); stopped = true; break; }
        const file = path.join(directory, entry.name), value = relative(changeRoot, file);
        if (entry.isSymbolicLink()) { diagnostic('change_asset_symlink_ignored', '符号链接不作为交付资料读取。', value); continue; }
        if (entry.isDirectory()) {
          if (['.git', 'node_modules'].includes(entry.name)) continue;
          try { assertMarkdownImageSourceRoot(changeRoot, file); visit(file, depth + 1); }
          catch { diagnostic('change_asset_directory_unreadable', '资料目录当前不可安全读取。', value); }
        } else if (entry.isFile() && extraFile(value)) {
          try { assets.push(inspectChangeAsset(changeRoot, value, pathBase)); }
          catch { diagnostic('change_asset_file_unreadable', '资料文件当前不可安全读取。', value); }
        }
      }
    } finally { opened.closeSync(); }
  }
  visit(changeRoot, 0);
  return { assets: assets.sort((left, right) => left.relativePath.localeCompare(right.relativePath)), assetDiagnostics };
}

export function readChangeAsset(changeRoot: string, value: string, expectedSourceIdentity: string) {
  if (!/^sha256-[0-9a-f]{64}$/.test(expectedSourceIdentity)) throw failure('task_change_asset_input_invalid', '读取资料需要提供已观察的来源身份。');
  const asset = inspectChangeAsset(changeRoot, value, changeRoot);
  if (asset.sourceIdentity !== expectedSourceIdentity) throw failure('task_change_asset_source_changed', '资料来源已变化，请刷新交付资料列表。', 409);
  if (asset.kind === 'unsupported') throw failure('task_change_asset_unsupported', '当前格式暂不支持预览。', 415);
  let content: string | null = null, imageDataUrl: string | null = null, bytes: Buffer;
  if (asset.kind === 'image') {
    const image = readDocumentImage(changeRoot, value);
    bytes = image.bytes;
    imageDataUrl = `data:${image.contentType};base64,${bytes.toString('base64')}`;
  } else {
    if (asset.sizeBytes > MAX_TEXT_BYTES) throw failure('task_change_asset_too_large', `文本资料超过 ${MAX_TEXT_BYTES} 字节，暂不能预览。`, 413);
    bytes = readVerifiedReadonlyBytes(fs.realpathSync(changeRoot), value, MAX_TEXT_BYTES);
    try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw failure('task_change_asset_encoding_invalid', '资料不是可预览的 UTF-8 文本。', 415); }
    if (content.includes('\0')) throw failure('task_change_asset_encoding_invalid', '资料包含二进制内容，暂不能预览。', 415);
  }
  if (inspectChangeAsset(changeRoot, value, changeRoot).sourceIdentity !== expectedSourceIdentity) throw failure('task_change_asset_source_changed', '资料来源在读取时变化，请刷新交付资料列表。', 409);
  return { path: value, name: asset.name, kind: asset.kind, content, imageDataUrl, actualDigest: digest(bytes) };
}
