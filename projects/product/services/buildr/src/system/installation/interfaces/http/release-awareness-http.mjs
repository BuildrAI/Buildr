import { withJsonSchema } from '../../../../infrastructure/contracts/public-json.ts';
import {
  RELEASE_AWARENESS_HTTP_OPERATIONS,
  RELEASE_AWARENESS_HTTP_SCHEMAS,
  validateReleaseAwarenessHttp,
} from './release-awareness-http-contracts.mjs';

export function createReleaseAwarenessHttpContribution(application) {
  return Object.freeze({
    id: 'system-installation.release-awareness.http',
    operations: RELEASE_AWARENESS_HTTP_OPERATIONS,
    schemas: RELEASE_AWARENESS_HTTP_SCHEMAS,
    handleTopLevel: ({ request, pathname }) => {
      if (request.method !== 'GET' || pathname !== '/api/v1/release-awareness') return null;
      validateReleaseAwarenessHttp(RELEASE_AWARENESS_HTTP_SCHEMAS.request.$id, {});
      const awareness = application.releaseAwareness({ allowDevelopmentQuery: false, persistState: true, notify: true });
      return { status: 200, body: withJsonSchema('buildr.release-awareness/v1', awareness) };
    },
  });
}
