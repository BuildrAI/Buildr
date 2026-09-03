import { registerPublicationApplication } from './application/publication-application.ts';
import { createPublicationHttpContribution } from './interfaces/http/publication-http.ts';
import { PROJECT_APPLICATION } from '../../workspace/module.ts';

export const PUBLICATION_MODULE_ID = 'publication';
export const PUBLICATION_APPLICATION = 'publication.application';

const METHODS = Object.freeze(['listPublications', 'publicationDetail', 'readPublicationAsset']);

export function createPublicationModule(runtime: any) {
  return Object.freeze({
    id: PUBLICATION_MODULE_ID,
    requires: Object.freeze([PROJECT_APPLICATION]),
    create(requires: any) {
      registerPublicationApplication(runtime, { projectQuery: requires[PROJECT_APPLICATION] });
      const application = Object.freeze(Object.fromEntries(METHODS.map((method: any) => [method, (...args: any[]) => runtime[method](...args)])));
      return Object.freeze({
        provides: { [PUBLICATION_APPLICATION]: application },
        contributions: { http: [createPublicationHttpContribution(application)] },
      });
    },
  });
}
