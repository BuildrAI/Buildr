import { useEffect, useMemo, useReducer } from 'react';
import { useAgentRuntime } from '../../../app/AgentRuntimeContext';
import { codeActionsApi } from '../api/code-actions-api';
import { SourceControlActions } from '../source-control-actions';

export function useSourceControlActions(workspaceId: string, onRefresh: () => void | Promise<void>) {
  const agents = useAgentRuntime();
  const actions = useMemo(() => new SourceControlActions(codeActionsApi, onRefresh, agents.refresh), [workspaceId, onRefresh, agents.refresh]);
  const [, render] = useReducer(value => value + 1, 0);
  useEffect(() => actions.subscribe(render), [actions]);
  useEffect(() => () => actions.dispose(), [actions]);
  return actions;
}
