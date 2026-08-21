import { registerPublicationApplication } from '../application/publication/publication-application.mjs';
import { createPublicationHttpContribution } from './interfaces/http/publication-http.mjs';

export const PUBLICATION_MODULE_ID = 'publication';
export const PUBLICATION_APPLICATION = 'publication.application';

const METHODS = Object.freeze(['listPublications', 'publicationDetail', 'readPublicationAsset']);

export function createPublicationModule(runtime) {
  return Object.freeze({
    id: PUBLICATION_MODULE_ID,
    requires: Object.freeze([]),
    create() {
      registerPublicationApplication(runtime);
      const application = Object.freeze(Object.fromEntries(METHODS.map((method) => [method, (...args) => runtime[method](...args)])));
      return Object.freeze({
        provides: { [PUBLICATION_APPLICATION]: application },
        contributions: { http: [createPublicationHttpContribution(application)] },
      });
    },
  });
}
