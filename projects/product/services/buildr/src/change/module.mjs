import { registerChangeApplication } from '../application/change/change-application.mjs';
import { createChangeHttpContribution } from './interfaces/http/change-http.mjs';

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
    requires: Object.freeze([]),
    create() {
      registerChangeApplication(runtime);
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
