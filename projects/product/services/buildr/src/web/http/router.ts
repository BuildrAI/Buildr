import process from 'node:process';

import { pickWorkspaceDirectory } from '../infrastructure/directory-picker.ts';
import { binaryResponse, jsonResponse, textResponse, uiPrototypeHtmlResponse } from './responses.ts';
import { assertWriteRequest, readAllowedJsonBody, readJsonBody } from './session.ts';
import { injectedIndexHtml, serveDistAsset } from './static-files.ts';
import {
  BUILDR_WEB_HTTP_OPERATIONS,
  BUILDR_WEB_HTTP_SCHEMAS,
  buildrWebOperation,
  validateBuildrWebHttp,
} from './buildr-web-http-contracts.ts';

const WORKSPACE_ID = '[0-9a-fA-F-]{36}';

function workspaceApiMatch(pathname: any) {
  return pathname.match(new RegExp(`^/api/v1/workspaces/(${WORKSPACE_ID})(/.*)?$`));
}

function contributionRespond(response: any) {
  return Object.freeze({
    binary: (content: any, contentType: any) => binaryResponse(response, 200, content, contentType),
    uiPrototypeHtml: (content: any) => uiPrototypeHtmlResponse(response, content),
  });
}

export function createLocalWorkspaceRequestRouter({
  runtime,
  taskIdPattern,
  sessionToken,
  healthSecret,
  launcherIdentity,
  productIdentity,
  webProfile,
  previewIdentity,
  httpContributions,
  origin,
  isClosing,
  shutdown,
  submitTaskRead,
  staticRoot,
}: any) {
  const validateRequest = (id: any, value: any) => validateBuildrWebHttp(buildrWebOperation(id).requestSchemaId, value, id);
  const workspaceAppRoute = new RegExp(`^/workspaces/${WORKSPACE_ID}(?:/overview|/settings|/articles(?:/${taskIdPattern})?|/tasks(?:/${taskIdPattern}(?:/changes/[A-Za-z0-9][A-Za-z0-9._-]*/${taskIdPattern})?)?|/projects(?:/[A-Za-z0-9][A-Za-z0-9._-]*(?:/edit)?)?|/services(?:/[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*(?:/edit)?)?)?/?$`);

  return async function routeLocalWorkspaceRequest(request: any, response: any) {
    const requestUrl = new URL(request.url || '/', origin() || 'http://127.0.0.1');
    const pathname = requestUrl.pathname;
    if (isClosing() && pathname !== '/api/v1/health') {
      jsonResponse(response, 503, { error: { code: 'app_shutting_down', message: 'Buildr 正在退出。' } });
      return;
    }
    if (request.method === 'GET' && (pathname === '/' || workspaceAppRoute.test(pathname))) {
      textResponse(response, 200, injectedIndexHtml(sessionToken, previewIdentity, webProfile, staticRoot), 'text/html; charset=utf-8');
      return;
    }
    if (request.method === 'GET' && serveDistAsset(response, pathname, staticRoot)) return;
    if (request.method === 'GET' && pathname === '/api/v1/health') {
      if (request.headers['x-buildr-instance'] !== healthSecret) {
        jsonResponse(response, 403, { error: { code: 'instance_forbidden', message: 'Buildr instance secret 无效。' } });
        return;
      }
      validateRequest('local-app.health', {});
      jsonResponse(response, 200, {
        schemaVersion: 'buildr.local-app-health/v1',
        status: isClosing() ? 'stopping' : 'ready',
        pid: process.pid,
        launcherIdentity,
        productIdentity,
        webProfile,
        previewIdentity,
      });
      return;
    }
    for (const contribution of httpContributions) {
      if (typeof contribution.handleTopLevel !== 'function') continue;
      const contributedResponse = await contribution.handleTopLevel({
        request,
        pathname,
        searchParams: requestUrl.searchParams,
        authorizeWrite: () => assertWriteRequest(request, origin(), sessionToken),
        readJsonBody: () => readJsonBody(request),
        pickWorkspaceDirectory,
        respond: contributionRespond(response),
      });
      if (contributedResponse === true) return;
      if (contributedResponse) return jsonResponse(response, contributedResponse.status, contributedResponse.body);
    }
    if (request.method === 'POST' && pathname === '/api/v1/app/quit') {
      assertWriteRequest(request, origin(), sessionToken);
      validateRequest('local-app.quit', await readJsonBody(request));
      jsonResponse(response, 202, { status: 'stopping' });
      shutdown();
      return;
    }
    if (request.method === 'POST' && pathname === '/api/v1/app/quit-instance') {
      if (request.headers['x-buildr-instance'] !== healthSecret) {
        jsonResponse(response, 403, { error: { code: 'instance_forbidden', message: 'Buildr instance secret 无效。' } });
        return;
      }
      validateRequest('local-app.quit-instance', {});
      jsonResponse(response, 202, { status: 'stopping' });
      shutdown();
      return;
    }
    const apiMatch = workspaceApiMatch(pathname);
    if (apiMatch) {
      if (requestUrl.searchParams.has('target') || requestUrl.searchParams.has('path') || requestUrl.searchParams.has('root')) {
        const error: Error & Record<string, any> = new Error('Workspace API 只接受已登记 workspaceId，不接受 filesystem path。');
        error.code = 'target_forbidden';
        error.status = 400;
        throw error;
      }
      const workspaceId = apiMatch[1];
      const suffix = apiMatch[2] || '';
      const { rootPath: root } = runtime.resolveRegisteredWorkspace(workspaceId, { touch: request.method === 'GET' });
      const taskApi = suffix === '/tasks' || suffix.startsWith('/tasks/');
      for (const contribution of httpContributions) {
        if (typeof contribution.handle !== 'function') continue;
        const contributedResponse = await contribution.handle({
          request,
          suffix,
          searchParams: requestUrl.searchParams,
          root,
          authorizeWrite: () => assertWriteRequest(request, origin(), sessionToken),
          readBody: (allowed: any, label: any) => readAllowedJsonBody(request, allowed, label),
          readJsonBody: () => readJsonBody(request),
          submitTaskRead: (operation: any, taskId: any, input: any = {}) => submitTaskRead(request, response, operation, root, taskId, input),
          respond: contributionRespond(response),
        });
        if (contributedResponse === true) return;
        if (contributedResponse) return jsonResponse(response, contributedResponse.status, contributedResponse.body);
      }
      if (taskApi && requestUrl.searchParams.size > 0 && !(request.method === 'GET' && suffix === '/tasks')) {
        const error: Error & Record<string, any> = new Error('Task API 不接受 query 参数。');
        error.code = 'task_api_query_forbidden';
        error.status = 400;
        throw error;
      }
    }
    jsonResponse(response, 404, { error: { code: 'not_found', message: '请求的 Buildr Web 资源不存在。' } });
  };
}

export { BUILDR_WEB_HTTP_OPERATIONS, BUILDR_WEB_HTTP_SCHEMAS };
