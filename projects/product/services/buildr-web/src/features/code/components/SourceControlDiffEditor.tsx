import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Spin } from 'antd';
import { useFileEditingContext } from '../../../app/FileEditingContext';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import { FileDiffEditor } from '../../../components/file-editing/FileDiffEditor';
import { useEditableFile, fileSnapshot } from '../hooks/useEditableFile';
import { useSourceControlRead } from '../hooks/useSourceControlRead';
import type { CodeDiffResponse, CodeSourceControlInput, CodeSourceFileResponse } from '../api/code-api';
import type { SourceControlReader } from '../source-control-model';

type Props = {
  workspaceId: string;
  diff: CodeDiffResponse;
  reader: SourceControlReader;
  mode: 'split' | 'unified';
};

/** Only the live SCM entry connects full, verified contents to the shared file editor. */
export function SourceControlDiffEditor({ workspaceId, diff, reader, mode }: Props) {
  const editing = useFileEditingContext();
  const active = useContext(WorkspaceViewActiveContext);
  const { message } = App.useApp();
  const source = diff.source;
  const key = JSON.stringify([workspaceId, source.repositoryId, source.checkoutId, source.worktreeId, source.location, diff.area, diff.file.path]);
  const selected = useRef(key); selected.current = key;
  const restoring = useRef<AbortController | null>(null);
  const [reload, setReload] = useState(0);
  const [restoreError, setRestoreError] = useState('');
  const current = useEditableFile(workspaceId, source.checkoutId ? { kind: 'code', repositoryId: source.repositoryId, checkoutId: source.checkoutId, path: diff.file.path } : null, reload);
  const working = diff.area === 'working';
  const emptyBase = diff.area === 'untracked' || working && (!diff.baseHash || diff.file.status === 'added');
  const baseInput: CodeSourceControlInput = { repositoryId: source.repositoryId, worktreeId: source.worktreeId || source.checkoutId || undefined, path: diff.file.previousPath || diff.file.path, area: working ? 'commit' : 'staged', ...(working && diff.baseHash ? {commitHash: diff.baseHash} : {}) };
  const readBaseline = useCallback(async (input: CodeSourceControlInput, signal: AbortSignal) => {
    const value = await reader.sourceFile(input, signal);
    if (!value.truncated && !value.page && ['text', 'markdown'].includes(value.kind)) {
      // The read-only reader can display replacement characters for invalid UTF-8.
      // Such text must never become a lossy restore source.
      const bytes = new TextEncoder().encode(value.content);
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      const digest = 'sha256-' + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
      if (digest !== value.digest) throw new Error('比较基线不是可无损恢复的完整 UTF-8 文本，保持只读。');
    }
    return value;
  }, [reader]);
  const baseline = useSourceControlRead(key, baseInput, readBaseline, !emptyBase && (working || diff.area === 'unstaged'), diff.observedRevision + ':' + reload);
  useEffect(() => {
    setRestoreError('');
    return () => { restoring.current?.abort(); restoring.current = null; };
  }, [key]);
  useEffect(() => {
    if (!active || emptyBase || !working && diff.area !== 'unstaged') return;
    const refresh = () => { if (document.visibilityState === 'visible') void baseline.refresh(); };
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [key, active, diff.area, baseline.refresh]);

  const completeBase = (value: CodeSourceFileResponse) => value.source.repositoryId === source.repositoryId
    && value.source.checkoutId === source.checkoutId && value.source.location === source.location
    && (value.source.worktreeId || value.source.checkoutId) === (source.worktreeId || source.checkoutId)
    && (working ? value.source.commitHash === diff.baseHash : !value.source.commitHash) && value.path === baseInput.path && !value.truncated && !value.page
    && (value.kind === 'text' || value.kind === 'markdown');
  const file = current.file;
  const snapshot = file ? fileSnapshot(file) : undefined;
  const selector = snapshot?.selector;
  const validCurrent = snapshot && selector?.kind === 'code' && selector.repositoryId === source.repositoryId
    && selector.checkoutId === source.checkoutId && selector.path === diff.file.path
    && snapshot.rootPath === source.location && (snapshot.kind === 'text' || snapshot.kind === 'markdown');
  const original = emptyBase ? '' : baseline.data?.content;
  const validBase = emptyBase || baseline.data && completeBase(baseline.data);

  async function beforeRestore(): Promise<boolean> {
    restoring.current?.abort();
    const request = new AbortController(); restoring.current = request;
    const observedKey = key;
    setRestoreError('');
    try {
      if (working) {
        const latest = await reader.diff({repositoryId: source.repositoryId, worktreeId: source.worktreeId || source.checkoutId || undefined, path: diff.file.path, area: 'working'}, request.signal);
        if (latest.baseHash !== diff.baseHash || latest.file.previousPath !== diff.file.previousPath || latest.source.location !== source.location || latest.source.checkoutId !== source.checkoutId || latest.file.status !== diff.file.status) throw new Error('最近提交或文件来源已变化，请刷新后重新核对。');
      }
      if (emptyBase) {
        // A formerly untracked file may have entered the index in another entry.
        const latest = await reader.diff({ repositoryId: source.repositoryId, worktreeId: source.worktreeId || source.checkoutId || undefined, path: diff.file.path, area: working ? 'working' : 'untracked' }, request.signal);
        if ((!working && latest.area !== 'untracked') || latest.source.repositoryId !== source.repositoryId || latest.source.location !== source.location || latest.source.checkoutId !== source.checkoutId || latest.file.path !== diff.file.path || latest.binary || latest.file.previewTruncated) throw new Error('文件已不在原来的未跟踪比较中，请刷新后重新核对。');
      } else {
        const latest = await readBaseline(baseInput, request.signal);
        if (!completeBase(latest)) throw new Error('无法确认完整且相同来源的比较基线，请刷新后重新核对。');
        if (request.signal.aborted || selected.current !== observedKey) return false;
        if (latest.revision !== baseline.data?.revision || latest.content !== original) {
          baseline.update(() => latest);
          message.info('比较基线已变化，已更新比较；请核对后再次恢复。');
          return false;
        }
      }
      return !request.signal.aborted && selected.current === observedKey;
    } catch (error) {
      if (!request.signal.aborted && selected.current === observedKey) setRestoreError(error instanceof Error ? error.message : '无法核对最新基线，本次恢复未执行。');
      return false;
    } finally { if (restoring.current === request) restoring.current = null; }
  }

  const error = current.error || (file && !validCurrent ? snapshot?.readonlyReason || '当前文件来源或完整性无法核对。' : '')
    || (baseline.data && !validBase ? '比较基线不是完整文本或来源已变化。' : '')
    || (!baseline.data ? baseline.error : '');
  if (error) return <div className="source-control-diff-fallback"><Alert type="warning" showIcon message="当前差异只读" description={error} action={<Button size="small" onClick={() => setReload(value => value + 1)}>重新读取</Button>} /><pre>{diff.patch}</pre></div>;
  if (!file || !validCurrent || !validBase || original === undefined) return <div className="source-control-diff-loading" role="status"><Spin size="small" /> 正在核对完整文件与比较基线…</div>;
  return <div className="source-control-editable-diff">
    {baseline.error && <Alert type="warning" showIcon message="暂时无法刷新比较基线" description={baseline.error} />}
    {restoreError && <Alert type="warning" showIcon message="本次恢复未执行，输入已保留" description={restoreError} />}
    <FileDiffEditor file={file} editing={editing} original={original} mode={mode} active={active} beforeRestore={beforeRestore} originalLabel={emptyBase ? '旧版本 · 文件不存在' : working ? '最近一次提交（Commit）' : '暂存版本'} currentLabel="当前文件" />
  </div>;
}
