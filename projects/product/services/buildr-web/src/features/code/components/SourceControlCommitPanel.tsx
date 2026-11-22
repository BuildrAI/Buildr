import { useEffect, useState } from 'react';
import {
  SourceControlCommitPanel as HarnessSourceControlCommitPanel,
  type SourceControlRepository,
} from '../../../../../buildr-harness-web/src/source-control';
import type { SourceControlWorktree } from '../source-control-model';
import { agentConversationsApi } from '../../harness-ui/api/agent-conversations-api';
import { useOptionalAgentConversations } from '../../harness-ui/AgentConversationsContext';
import { modelCatalogRefreshMs } from '../../harness-ui/page-visibility';
import type { ExecutionModelSource } from '../../../lib/execution-model';
import type { SourceControlActions } from '../source-control-actions';

type Props = {
  active?: boolean;
  workspaceId: string;
  repository: SourceControlRepository;
  worktree: SourceControlWorktree;
  actions: SourceControlActions;
  version: string;
};

export function SourceControlCommitPanel({ active = true, workspaceId, repository, worktree, actions, version }: Props) {
  const conversations = useOptionalAgentConversations();
  const [standaloneModelCatalog, setStandaloneModelCatalog] = useState<ExecutionModelSource[]>([]);
  const [standaloneModelsLoading, setStandaloneModelsLoading] = useState(!conversations);
  const [standaloneModelError, setStandaloneModelError] = useState('');
  const modelCatalog = conversations ? conversations.modelCatalog : standaloneModelCatalog;
  const modelsLoading = conversations ? (!conversations.modelCatalogReady && !conversations.modelCatalog.length && !conversations.modelCatalogError) : standaloneModelsLoading;
  const modelError = conversations ? conversations.modelCatalogError : standaloneModelError;
  const hasConversations = Boolean(conversations);
  const conversationCatalogReady = conversations?.modelCatalogReady ?? false;
  const refreshConversationCatalog = conversations?.refreshModelCatalog;
  useEffect(() => {
    if (!active) return;
    if (hasConversations) {
      if (!conversationCatalogReady) void refreshConversationCatalog?.().catch(() => {});
      return;
    }
    let disposed = false, generation = 0;
    const refresh = async () => {
      const current = ++generation;
      try {
        const catalog = await agentConversationsApi.modelCatalog();
        if (!disposed && current === generation) { setStandaloneModelCatalog(catalog.models); setStandaloneModelError(catalog.diagnostic || ''); }
      } catch (error) {
        if (!disposed && current === generation) setStandaloneModelError(error instanceof Error ? error.message : '无法读取模型目录');
      } finally { if (!disposed && current === generation) setStandaloneModelsLoading(false); }
    };
    void refresh();
    const focused = () => { void refresh(); };
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, modelCatalogRefreshMs(false));
    window.addEventListener('focus', focused);
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener('focus', focused); };
  }, [active, hasConversations, conversationCatalogReady, refreshConversationCatalog]);

  return <HarnessSourceControlCommitPanel active={active} workspaceId={workspaceId} repository={repository} worktree={worktree} actions={actions} version={version} modelCatalog={modelCatalog} modelsLoading={modelsLoading} modelError={modelError} />;
}
