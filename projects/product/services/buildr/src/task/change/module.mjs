import { registerChangeApplication } from './application/change-application.mjs';
import { createChangeHttpContribution } from './interfaces/http/change-http.mjs';
import { OPENSPEC_QUERY } from '../openspec/module.mjs';
import { PROJECT_APPLICATION } from '../../workspace/module.mjs';

export const CHANGE_MODULE_ID = 'change';
export const CHANGE_APPLICATION = 'change.application';

const METHODS = Object.freeze([
  'listProjectChanges', 'listChanges', 'changeDetail', 'generateChangeCreatePrompt',
  'generateChangeActionPrompt', 'resolveTaskScopedChange', 'taskScopedChangeDetail',
  'taskUiPrototypes', 'taskUiPrototype',
]);

export function createChangeModule(runtime) {
  return Object.freeze({
    id: CHANGE_MODULE_ID,
    requires: Object.freeze([OPENSPEC_QUERY, PROJECT_APPLICATION]),
    create(requires) {
      registerChangeApplication(runtime, {
        openSpecQuery: requires[OPENSPEC_QUERY],
        projectQuery: requires[PROJECT_APPLICATION],
      });
      const application = Object.freeze({
        ...Object.fromEntries(METHODS.map((method) => [method, (...args) => runtime[method](...args)])),
        inspectTaskRecord: (...args) => runtime.inspectTaskRecord(...args),
      });
      return Object.freeze({
        provides: { [CHANGE_APPLICATION]: application },
        contributions: { http: [createChangeHttpContribution(application)] },
      });
    },
  });
}
