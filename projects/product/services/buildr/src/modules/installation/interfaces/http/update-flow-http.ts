import {
  UPDATE_FLOW_HTTP_OPERATIONS,
  UPDATE_FLOW_HTTP_SCHEMAS,
  validateUpdateFlowHttp,
} from './update-flow-http-contracts.ts';

function previewRejected(previewIdentity: any) {
  if (!previewIdentity) return;
  const error: Error & Record<string, any> = new Error('开发预览实例不提供页面内更新，请在正式或开发实例中操作。');
  error.code = 'update_flow_preview_unsupported';
  error.status = 409;
  throw error;
}

export function createUpdateFlowHttpContribution(application: any) {
  return Object.freeze({
    id: 'system-installation.update-flow.http',
    operations: UPDATE_FLOW_HTTP_OPERATIONS,
    schemas: UPDATE_FLOW_HTTP_SCHEMAS,
    handleTopLevel: async ({ request, pathname, searchParams, authorizeWrite, readJsonBody, previewIdentity }: any) => {
      if (request.method === 'GET' && pathname === '/api/v1/update/status') {
        validateUpdateFlowHttp(UPDATE_FLOW_HTTP_SCHEMAS.statusRequest.$id, {}, 'request', 'system-installation.update-flow.status');
        return { status: 200, body: application.webUpdateStatus() };
      }
      if (request.method === 'POST' && pathname === '/api/v1/update/prepare') {
        authorizeWrite();
        previewRejected(previewIdentity);
        const body = validateUpdateFlowHttp(UPDATE_FLOW_HTTP_SCHEMAS.prepareRequest.$id, await readJsonBody(), 'request', 'system-installation.update-flow.prepare');
        return { status: 202, body: application.webUpdatePrepare(body) };
      }
      if (request.method === 'POST' && pathname === '/api/v1/update/apply') {
        authorizeWrite();
        previewRejected(previewIdentity);
        const body = validateUpdateFlowHttp(UPDATE_FLOW_HTTP_SCHEMAS.applyRequest.$id, await readJsonBody(), 'request', 'system-installation.update-flow.apply');
        return { status: 202, body: application.webUpdateApply(body) };
      }
      if (request.method === 'POST' && pathname === '/api/v1/update/recover') {
        authorizeWrite();
        previewRejected(previewIdentity);
        const body = validateUpdateFlowHttp(UPDATE_FLOW_HTTP_SCHEMAS.recoveryRequest.$id, await readJsonBody(), 'request', 'system-installation.update-flow.recover');
        return { status: 202, body: application.webUpdateRecover(body) };
      }
      return null;
    },
  });
}
