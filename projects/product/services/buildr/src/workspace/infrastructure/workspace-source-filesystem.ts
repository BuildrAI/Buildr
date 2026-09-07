import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sourceRootKind, SOURCE_ROOT_ATTACHED } from '../domain/source-root.ts';

export function resolveSourceRoot(workspaceRoot: any, source: any) {
  return sourceRootKind(source) === SOURCE_ROOT_ATTACHED ? source.path : path.resolve(workspaceRoot, source.path);
}

type DocumentError = (code: string, message: string, status: number) => Error;

/** 来源目录的技术访问：路径定位、文档读取、复制及暂存生命周期。 */
export function createWorkspaceSourceFilesystem() {
  function readDocument(root: string, documentPath: unknown, kind: 'project' | 'service', error: DocumentError) {
    const label = kind === 'project' ? '项目' : '服务';
    const raw = typeof documentPath === 'string' ? documentPath.trim() : '';
    if (!raw) throw error(`${kind}_document_not_allowed`, `不支持读取${label}文档：<empty>。`, 400);
    const forbidden = () => error(`${kind}_document_path_forbidden`, `${label}文档路径越界。`, 400);
    if (raw.includes('\0') || raw.includes('\\') || path.isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) throw forbidden();
    const relativePath = path.posix.normalize(raw);
    if (!relativePath || relativePath === '.' || relativePath === '..' || relativePath.startsWith('../') || path.posix.isAbsolute(relativePath)) throw forbidden();
    if (!relativePath.endsWith('.md')) throw error(`${kind}_document_not_allowed`, `不支持读取${label}文档：${relativePath}。`, 400);
    const file = path.resolve(root, relativePath);
    const relative = path.relative(path.resolve(root), file);
    if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) throw forbidden();
    let exists = false;
    try { exists = fs.statSync(file).isFile(); } catch { /* Missing document is a readable result. */ }
    return { path: relativePath, name: path.posix.basename(relativePath), exists, content: exists ? fs.readFileSync(file, 'utf8') : null };
  }

  function withStaging<T>(destination: string, action: (staging: string) => T): T {
    const staging = path.join(path.dirname(destination), `.${path.basename(destination)}.buildr-stage-${crypto.randomUUID()}`);
    try { return action(staging); }
    finally { if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true }); }
  }

  return Object.freeze({
    resolveRoot: resolveSourceRoot,
    realpath: (file: string) => fs.realpathSync(file),
    exists: (file: string) => fs.existsSync(file),
    readDocument,
    withStaging,
    copy: (source: string, destination: string) => fs.cpSync(source, destination, { recursive: true }),
    publish: (staging: string, destination: string) => fs.renameSync(staging, destination),
  });
}

export type WorkspaceSourceFilesystem = ReturnType<typeof createWorkspaceSourceFilesystem>;
