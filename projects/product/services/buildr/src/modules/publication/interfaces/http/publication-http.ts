import fs from 'node:fs';
import { MAX_PUBLICATION_JSON_BYTES, MAX_PUBLICATION_UPLOAD_JSON_BYTES, publicationError } from '../../domain/publication.ts';
import { PUBLICATION_HTTP_OPERATIONS, PUBLICATION_HTTP_SCHEMAS, publicationOperation, validatePublicationHttp } from './publication-http-contracts.ts';

const PUBLICATION_ID = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';
const PROJECT_CODE = '[A-Za-z0-9][A-Za-z0-9._-]*';

function decodeAssetPath(value: string) {
  try { return decodeURIComponent(value); }
  catch { throw publicationError('publication_asset_invalid', '文章资源路径不合法。'); }
}

export function createPublicationHttpContribution(application: any) {
  const validateRequest = (id: any, value: any) => validatePublicationHttp(publicationOperation(id).requestSchemaId, value, id);
  const success = (id: any, value: any) => ({ status: 200, body: validatePublicationHttp(publicationOperation(id).successSchemaId, value, id, 'response') });
  return Object.freeze({
    id: 'publication.http', operations: PUBLICATION_HTTP_OPERATIONS, schemas: PUBLICATION_HTTP_SCHEMAS,
    async handle({ request, suffix, root, respond, authorizeWrite, readJsonBody }: any) {
      if (request.method === 'GET' && suffix === '/publications') {
        validateRequest('system-publication.list', {});
        return success('system-publication.list', application.listPublications(root));
      }
      const legacyDetail = suffix.match(new RegExp(`^/publications/(${PUBLICATION_ID})$`));
      if (request.method === 'GET' && legacyDetail) {
        const input = validateRequest('system-publication.detail', { id: legacyDetail[1] });
        return success('system-publication.detail', application.publicationDetail(root, input.id));
      }
      const legacyAsset = suffix.match(new RegExp(`^/publications/(${PUBLICATION_ID})/assets/(.+)$`));
      const project = suffix.match(new RegExp(`^/projects/(${PROJECT_CODE})/publications(?:/(${PUBLICATION_ID})(?:/assets(?:/(.+))?)?)?$`));
      if (request.method === 'GET' && (legacyAsset || (project && project[3]))) {
        const op = legacyAsset ? 'system-publication.asset' : 'system-publication.project-asset';
        const input = validateRequest(op, legacyAsset
          ? { id: legacyAsset[1], assetPath: decodeAssetPath(legacyAsset[2]) }
          : { projectCode: project![1], id: project![2], assetPath: decodeAssetPath(project![3]) });
        const value = application.readPublicationAsset(root, input.id, input.assetPath, input.projectCode);
        respond.binary(fs.readFileSync(value.file), value.contentType, { disposition: value.isImage ? 'inline' : 'attachment', filename: value.name });
        return true;
      }
      if (!project) return null;
      const [, projectCode, id] = project;
      if (!id) {
        if (request.method === 'GET') return success('system-publication.project-list', application.listPublications(root, validateRequest('system-publication.project-list', { projectCode }).projectCode));
        if (request.method === 'POST') {
          authorizeWrite();
          return success('system-publication.create', application.createPublication(root, projectCode, validateRequest('system-publication.create', await readJsonBody(MAX_PUBLICATION_JSON_BYTES))));
        }
      } else if (suffix === `/projects/${projectCode}/publications/${id}/assets`) {
        if (request.method === 'GET') {
          validateRequest('system-publication.assets', { projectCode, id });
          return success('system-publication.assets', application.publicationAssets(root, projectCode, id));
        }
        if (request.method === 'POST') {
          authorizeWrite();
          return success('system-publication.upload', application.uploadPublicationAsset(root, projectCode, id, validateRequest('system-publication.upload', await readJsonBody(MAX_PUBLICATION_UPLOAD_JSON_BYTES))));
        }
      } else if (!project[3]) {
        if (request.method === 'GET') {
          validateRequest('system-publication.project-detail', { projectCode, id });
          return success('system-publication.project-detail', application.publicationDetail(root, id, projectCode));
        }
        if (request.method === 'PUT' || request.method === 'DELETE') {
          authorizeWrite();
          const op = request.method === 'PUT' ? 'system-publication.update' : 'system-publication.delete';
          const input = validateRequest(op, await readJsonBody(request.method === 'PUT' ? MAX_PUBLICATION_JSON_BYTES : undefined));
          return success(op, request.method === 'PUT' ? application.updatePublication(root, projectCode, id, input) : application.deletePublication(root, projectCode, id, input));
        }
      }
      return null;
    },
  });
}
