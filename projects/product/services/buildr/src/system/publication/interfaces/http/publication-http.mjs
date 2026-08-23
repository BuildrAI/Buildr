import fs from 'node:fs';
import {
  PUBLICATION_HTTP_OPERATIONS,
  PUBLICATION_HTTP_SCHEMAS,
  publicationOperation,
  validatePublicationHttp,
} from './publication-http-contracts.mjs';

const PUBLICATION_ID = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';

export function createPublicationHttpContribution(application) {
  const validateRequest = (id, value) => validatePublicationHttp(publicationOperation(id).requestSchemaId, value, id);
  const success = (id, value) => validatePublicationHttp(publicationOperation(id).successSchemaId, value, id, 'response');
  return Object.freeze({
    id: 'publication.http',
    operations: PUBLICATION_HTTP_OPERATIONS,
    schemas: PUBLICATION_HTTP_SCHEMAS,
    handle: ({ request, suffix, root, respond }) => {
      if (request.method === 'GET' && suffix === '/publications') {
        validateRequest('system-publication.list', {});
        return { status: 200, body: success('system-publication.list', application.listPublications(root)) };
      }
      const detail = suffix.match(new RegExp(`^/publications/(${PUBLICATION_ID})$`));
      if (request.method === 'GET' && detail) {
        const input = validateRequest('system-publication.detail', { id: detail[1] });
        return { status: 200, body: success('system-publication.detail', application.publicationDetail(root, input.id)) };
      }
      const asset = suffix.match(new RegExp(`^/publications/(${PUBLICATION_ID})/assets/(.+)$`));
      if (request.method === 'GET' && asset) {
        const input = validateRequest('system-publication.asset', { id: asset[1], assetPath: decodeURIComponent(asset[2]) });
        const value = application.readPublicationAsset(root, input.id, input.assetPath);
        respond.binary(fs.readFileSync(value.file), value.contentType);
        return true;
      }
      return null;
    },
  });
}
