import { registerPublicationApplication } from './application/publication-application.ts';
import { createPublicationHttpContribution } from './interfaces/http/publication-http.ts';
import { WORKSPACE_QUERY } from '../workspace/module.ts';
import { TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER } from '../task/module.ts';
import { TASK_MATERIALS_APPLICATION } from '../task/materials/module.ts';

export const PUBLICATION_MODULE_ID = 'publication';
export const PUBLICATION_APPLICATION = 'publication.application';

const METHODS = Object.freeze(['listPublications', 'publicationDetail', 'readPublicationAsset', 'createPublication', 'updatePublication', 'deletePublication', 'publicationAssets', 'uploadPublicationAsset', 'worktreePublicationDetail', 'readWorktreePublicationAsset', 'updateWorktreePublication']);

export function createPublicationModule(runtime: any) {
  return Object.freeze({
    id: PUBLICATION_MODULE_ID,
    requires: Object.freeze([WORKSPACE_QUERY, TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER, TASK_MATERIALS_APPLICATION]),
    create(requires: any) {
      const composition = Object.create(runtime);
      registerPublicationApplication(composition, { projectQuery: requires[WORKSPACE_QUERY], taskQuery: requires[TASK_QUERY_APPLICATION], worktreeQuery: requires[TASK_WORKTREE_PROVIDER], materialsQuery: requires[TASK_MATERIALS_APPLICATION] });
      const application = Object.freeze(Object.fromEntries(METHODS.map((method: any) => [method, (...args: any[]) => composition[method](...args)])));
      return Object.freeze({
        provides: { [PUBLICATION_APPLICATION]: application },
        contributions: { http: [createPublicationHttpContribution(application)] },
      });
    },
  });
}
