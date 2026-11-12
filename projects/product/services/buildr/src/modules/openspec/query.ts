import { inspectChangeChecklist, parseChangeChecklistText } from './application/change-checklist.ts';
import { createChangeQuery, type ProjectQuery } from './application/change-query.ts';

export { inspectChangeAsset, readChangeAsset } from './application/change-assets.ts';
export type { ChangeQuery, ChangeModel, ChangeLifecycle, Project, PrototypePage, PrototypeDiagnostic } from './application/change-query.ts';
export const OPENSPEC_QUERY = 'openspec.query';

export function createOpenSpecQuery(projects: ProjectQuery) {
  return Object.freeze({ ...createChangeQuery(projects), inspectChangeChecklist, parseChangeChecklistText });
}
