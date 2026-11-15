import type {AccessCredential, AccessExecutionScope, ProgrammaticAccessView} from './api/programmatic-access-api.ts';

const sameScope = (a: AccessExecutionScope, b: AccessExecutionScope) => a.sourceId === b.sourceId && a.id === b.id;
export function programmaticScopeLabel(view: ProgrammaticAccessView, ref: AccessExecutionScope): string {
  return view.executionScopes?.find(item => sameScope(item.ref, ref))?.label
    ?? (ref.sourceId === 'buildr' ? view.workspaces.find(item => item.id === ref.id)?.name ?? ref.id : `${ref.sourceId} / ${ref.id}`);
}

/** Preserve exact existing grants when their source is temporarily absent from discovery. */
export function programmaticScopeOptions(view: ProgrammaticAccessView, editing?: AccessCredential | null) {
  const options = view.executionScopes?.map(item => ({...item})) ?? [];
  for (const ref of editing?.executionScopes ?? editing?.workspaceIds.map(id => ({sourceId: 'buildr', id})) ?? []) {
    if (!options.some(item => sameScope(item.ref, ref))) {
      options.push({key: JSON.stringify([ref.sourceId, ref.id]), ref, label: `${programmaticScopeLabel(view, ref)}（当前未发现，保留原授权）`});
    }
  }
  return options;
}
