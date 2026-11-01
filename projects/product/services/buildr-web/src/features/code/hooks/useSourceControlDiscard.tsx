import { useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { codeActionsApi } from '../api/code-actions-api';
import type { SourceControlChange, SourceControlRepository, SourceControlWorktree } from '../source-control-model';
import '../source-control-discard.css';

export function useSourceControlDiscard(workspaceId: string, refresh: (repositoryId?: string) => void | Promise<void>, active = true) {
  const { modal, message } = App.useApp();
  const [pending, setPending] = useState(false);
  const busy = useRef(false), generation = useRef(0);
  const dialog = useRef<{destroy(): void} | null>(null);
  useEffect(() => { const token = ++generation.current; busy.current = false; setPending(false); return () => { if (generation.current === token) ++generation.current; dialog.current?.destroy(); dialog.current = null; }; }, [workspaceId, active]);
  async function run(repository: SourceControlRepository, worktree: SourceControlWorktree, file?: SourceControlChange) {
    if (!active || busy.current || repository.cached) return;
    busy.current = true; setPending(true);
    const token = generation.current;
    const source = {workspaceId, repositoryId: repository.id, worktreeId: worktree.worktreeId, branch: worktree.branch};
    const finish = () => { if (generation.current === token) {busy.current = false; setPending(false); dialog.current = null;} };
    try {
      const context = await codeActionsApi.discardContext(source, file?.path);
      if (generation.current !== token) return;
      if (!context.paths.length) { message.info('当前没有可丢弃的更改。'); finish(); void refresh(repository.id); return; }
      dialog.current = modal.confirm({
        width: 640,
        title: file ? '丢弃此文件的更改？' : '丢弃当前工作树（Worktree）的所有更改？',
        okText: file ? '丢弃更改' : '丢弃所有更改', cancelText: '取消', okButtonProps: {danger: true},
        content: <div className="source-control-discard-confirm"><p>将恢复到最近一次提交（Commit），同时清除所列文件的已暂存及未暂存更改。新增文件将被删除，此操作无法撤销。</p><code>{context.source.location}</code><p>共 {context.paths.length} 个路径，其中 {context.removePaths.length} 个新增路径将被移除。</p><ul>{context.paths.map(path => <li key={path}><code>{path}</code></li>)}</ul></div>,
        onCancel: finish,
        onOk: async () => {
          try {
            const result = await codeActionsApi.discard(source, context.revision, file?.path);
            if (generation.current === token && result.status !== 'succeeded') message.warning(result.message, 8);
          } catch (error) { if (generation.current === token) message.error(error instanceof Error ? error.message : '丢弃结果未能确认，请刷新核对。', 8); }
          finally { finish(); void refresh(repository.id); }
        },
      });
    } catch (error) {
      if (generation.current === token) message.error(error instanceof Error ? error.message : '无法确认丢弃范围。');
      finish();
    }
  }
  return {pending, run};
}
