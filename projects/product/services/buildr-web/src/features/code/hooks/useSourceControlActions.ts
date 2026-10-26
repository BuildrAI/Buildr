import { useEffect, useMemo, useReducer } from 'react';
import { codeActionsApi } from '../api/code-actions-api';
import { SourceControlActions } from '../source-control-actions';

export function useSourceControlActions(workspaceId: string, onRefresh: () => void | Promise<void>) {
  const actions = useMemo(() => new SourceControlActions(codeActionsApi, onRefresh), [workspaceId, onRefresh]);
  const [, render] = useReducer(value => value + 1, 0);
  useEffect(() => actions.subscribe(render), [actions]);
  useEffect(() => () => actions.dispose(), [actions]);
  return actions;
}
