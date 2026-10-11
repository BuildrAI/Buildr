import fs from 'node:fs';
import path from 'node:path';
import { sameFilesystemPath, insideFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { codeGit, gitCommonDirectory, localPath, relativeCodePath, type CodeSource } from '../infrastructure/code-file-reader.ts';
import { assertEditableContent, editableSourceRevision, fileEditingFailure, readEditableFile, replaceEditableFile, type EditableFileLocation, type FileReadOnlyPolicy } from '../infrastructure/editable-file.ts';
import type { MarkdownImageContext } from '../../../infrastructure/filesystem/markdown-images.ts';

export type EditorFileSelector = { kind: 'code'; repositoryId: string; checkoutId: string; path: string } | { kind: 'project'; projectCode: string; path: string };
export type SaveEditorFileInput = { selector: EditorFileSelector; expectedFileId: string; expectedSourceRevision: string; expectedRevision: string; content: string };
type Dependencies = {
  codeSource(root: string, input: { repositoryId: string; checkoutId: string }): CodeSource;
  projectSource?(root: string, code: string): { project: { id: string; code: string; source: unknown }; sourceLocation: { path: string; identity: string } };
  builtinManagedFiles?(root: string, relative?: string): string[];
  projectDocumentImageContext?(root: string, code: string, path: string, content: string): MarkdownImageContext | undefined;
};

export function createFileEditingApplication(dependencies: Dependencies) {
  function location(root: string, selector: EditorFileSelector): EditableFileLocation {
    relativeCodePath(selector.path);
    if (selector.kind === 'code') {
      const source = dependencies.codeSource(root, selector);
      if(source.commitHash)throw fileEditingFailure('file_read_only','历史文件保持只读。',403);
      // Reuse code's existing Git-management exclusion before applying the stricter no-symlink editing policy.
      localPath(source, selector.path);
      return { rootPath: source.location, path: selector.path, sourceRevision: editableSourceRevision(source.location, ['code', selector.repositoryId, source.checkoutId]), locationLabel: path.basename(source.location), versionLabel: source.version };
    }
    if (selector.kind !== 'project' || !dependencies.projectSource) throw fileEditingFailure('file_source_invalid', '文件来源无法确认。');
    if (!selector.path.toLowerCase().endsWith('.md')) throw fileEditingFailure('file_project_document_forbidden', '项目资料编辑只支持来源目录内的 Markdown 文件。', 403);
    const source = dependencies.projectSource(root, selector.projectCode);
    let rootPath: string;
    try { rootPath = fs.realpathSync(source.sourceLocation.path); } catch { throw fileEditingFailure('file_source_unavailable', '项目资料来源目录当前不可读取。', 404); }
    let versionLabel = '当前文件';
    try { versionLabel = codeGit(rootPath, ['symbolic-ref', '--short', 'HEAD']).toString().trim() + ' · 当前文件'; }
    catch { try { versionLabel = codeGit(rootPath, ['rev-parse', '--short', 'HEAD']).toString().trim() + ' · 当前文件'; } catch { /* A non-Git project source is a supported current document. */ } }
    return { rootPath, path: selector.path, sourceRevision: editableSourceRevision(rootPath, ['project', source.project.id, source.project.source, source.sourceLocation.identity]), locationLabel: path.basename(rootPath), versionLabel };
  }
  function policy(root: string, source: EditableFileLocation) {
    return (file: string): FileReadOnlyPolicy => {
      if (file.split(path.sep).some(segment => segment.toLowerCase() === '.git')) return { code: 'file_git_metadata', message: 'Git 管理目录不能编辑。' };
      // Both the selected checkout and the enclosing workspace can own delivered assets.
      for (const candidate of new Set([root, source.rootPath])) {
        if (!insideFilesystemPath(candidate, file)) continue;
        try {
          const metadata = gitCommonDirectory(candidate);
          if (insideFilesystemPath(metadata, file)) return { code: 'file_git_metadata', message: 'Git 管理目录不能编辑。' };
        } catch { /* Non-Git source directories remain supported. */ }
        if (sameFilesystemPath(file, path.join(candidate, '.buildr', 'builtin-receipts.json'))) return { code: 'file_generated', message: '此文件由 Buildr 维护，请使用对应维护能力。' };
        let files: string[];
        try { files = dependencies.builtinManagedFiles?.(candidate, path.relative(candidate, file).split(path.sep).join('/')) || []; }
        catch { continue; /* Unavailable auxiliary ownership evidence does not block unrelated ordinary files. */ }
        if (files.some(relative => sameFilesystemPath(file, path.join(candidate, relative)))) return { code: 'file_generated', message: '此文件由 Buildr 交付，请修改产品来源并更新工作空间（Workspace）。' };
      }
      return null;
    };
  }
  function read(root: string, selector: EditorFileSelector) {
    const source = location(root, selector), observed = readEditableFile(source, policy(root, source));
    let imageContext: MarkdownImageContext | undefined;
    if (selector.kind === 'project') {
      try { imageContext = dependencies.projectDocumentImageContext?.(root, selector.projectCode, selector.path, observed.snapshot.content); }
      catch { /* Optional image observation cannot remove an already readable complete source. */ }
    }
    // Source mapping may change while its text is read; do not return an observation for another source.
    if (location(root, selector).sourceRevision !== source.sourceRevision) throw fileEditingFailure('file_source_changed', '读取期间来源身份已变化，请重新打开文件。', 409);
    return { ...observed, snapshot: { selector, ...observed.snapshot, ...(imageContext ? { imageContext } : {}) } };
  }
  function assertObserved(root: string, input: SaveEditorFileInput) {
    const current = read(root, input.selector);
    if (current.snapshot.fileId !== input.expectedFileId || current.snapshot.sourceRevision !== input.expectedSourceRevision) throw fileEditingFailure('file_source_changed', '文件来源身份已变化，已保留输入；请重新核对文件位置。', 409);
    if (current.snapshot.revision !== input.expectedRevision) throw fileEditingFailure('file_revision_conflict', '磁盘文件已变化，已暂停保存并保留输入。', 409, { current: current.snapshot });
    return current;
  }
  return Object.freeze({
    editorFile: (root: string, selector: EditorFileSelector) => read(root, selector).snapshot,
    saveFile: (root: string, input: SaveEditorFileInput) => {
      const current = assertObserved(root, input);
      assertEditableContent(current.snapshot, input.content);
      if (current.snapshot.content !== input.content) {
        replaceEditableFile(current.file, input.content, current.mode, () => {
          const latest = assertObserved(root, input);
          assertEditableContent(latest.snapshot, input.content);
          if (latest.file !== current.file) throw fileEditingFailure('file_source_changed', '文件实际位置已变化。', 409);
          // Source and ownership checks can perform Git/receipt reads. Recheck just
          // the held file bytes immediately before replacement, after those checks.
          const final = readEditableFile(latest.snapshot).snapshot;
          if (final.revision !== input.expectedRevision) {
            const { imageContext: _imageContext, ...snapshot } = latest.snapshot;
            throw fileEditingFailure('file_revision_conflict', '磁盘文件在保存前再次变化，已保留输入。', 409, { current: { ...snapshot, ...final } });
          }
        });
      }
      const saved = read(root, input.selector).snapshot;
      // An external writer can win immediately after rename; never report that our text is saved then.
      if (saved.content !== input.content) throw fileEditingFailure('file_revision_conflict', '保存后文件再次变化，已保留输入。', 409, { current: saved });
      return saved;
    },
  });
}
