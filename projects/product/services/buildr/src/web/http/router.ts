import process from 'node:process';

import { pickWorkspaceDirectory } from '../infrastructure/directory-picker.ts';
import { binaryResponse, jsonResponse, textResponse, uiPrototypeHtmlResponse, diagramHtmlResponse, eventStreamResponse } from './responses.ts';
import { assertRequestHost, assertReadRequest, assertWriteRequest, assertMutationRequest, readBinaryBody, readAllowedJsonBody, readJsonBody } from './session.ts';
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
    binary: (content: any, contentType: any, options?: { disposition: 'inline' | 'attachment'; filename: string }) => binaryResponse(response, 200, content, contentType, options),
    diagramHtml: (content: any) => diagramHtmlResponse(response, content),
    uiPrototypeHtml: (content: any) => uiPrototypeHtmlResponse(response, content),
    stream: (subscription: { events: AsyncIterable<unknown>; close(): void }, validate: (event: unknown) => unknown) => eventStreamResponse(response, subscription, validate),
  });
}

export function createLocalWorkspaceRequestRouter({
  resolveRegisteredWorkspace,
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
  restart,
  restartRequested,
  submitTaskRead,
  submitTaskWrite,
  staticRoot,
}: any) {
  const validateRequest = (id: any, value: any) => validateBuildrWebHttp(buildrWebOperation(id).requestSchemaId, value, id);
  const workspaceAppRoute = new RegExp(`^/workspaces/${WORKSPACE_ID}(?:/codex|/code(?:/(?:explorer|source-control))?|/overview|/workspace-overview|/connections|/connection-skills|/settings|/knowledge/(?:project|service)/[A-Za-z0-9][A-Za-z0-9._-]*|/skills(?:/[A-Za-z0-9%][A-Za-z0-9%._-]*)?|/repositories(?:/[A-Za-z0-9][A-Za-z0-9._-]*)?|/articles(?:/[A-Za-z0-9][A-Za-z0-9._-]*(?:/${taskIdPattern})?(?:/edit)?)?|/tasks(?:/${taskIdPattern}(?:/prototypes|/document|/changes/[A-Za-z0-9][A-Za-z0-9._-]*/${taskIdPattern})?)?|/projects(?:/[A-Za-z0-9][A-Za-z0-9._-]*(?:/edit)?)?|/services(?:/[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*(?:/edit)?)?)?)?/?$`);

  return async function routeLocalWorkspaceRequest(request: any, response: any) {
    const trustedOrigin = origin();
    assertRequestHost(request, trustedOrigin);
    const requestUrl = new URL(request.url || '/', trustedOrigin);
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
        authorizeRead: () => assertReadRequest(request, trustedOrigin, sessionToken),
        authorizeWrite: () => assertWriteRequest(request, trustedOrigin, sessionToken),
        readJsonBody: (maxBytes?: number) => readJsonBody(request, maxBytes),
        authorizeMutation: () => assertMutationRequest(request, trustedOrigin, sessionToken),
        readBinaryBody: (maxBytes: number) => readBinaryBody(request, maxBytes),
        pickWorkspaceDirectory,
        previewIdentity,
        respond: contributionRespond(response),
      });
      if (contributedResponse === true) return;
      if (contributedResponse) return jsonResponse(response, contributedResponse.status, contributedResponse.body);
    }
    if (request.method === 'POST' && pathname === '/api/v1/app/quit') {
      assertWriteRequest(request, trustedOrigin, sessionToken);
      validateRequest('local-app.quit', await readJsonBody(request));
      jsonResponse(response, 202, { status: 'stopping' });
      shutdown();
      return;
    }
    if (request.method === 'POST' && pathname === '/api/v1/app/restart') {
      assertWriteRequest(request, trustedOrigin, sessionToken);
      validateRequest('local-app.restart', await readJsonBody(request));
      if (previewIdentity) {
        const error: Error & Record<string, any> = new Error('开发预览实例不支持重启，请使用 preview stop 后重新启动。');
        error.code = 'restart_preview_unsupported';
        error.status = 409;
        throw error;
      }
      if (restartRequested?.()) {
        const error: Error & Record<string, any> = new Error('Buildr Web 重启已在进行。');
        error.code = 'restart_in_progress';
        error.status = 409;
        throw error;
      }
      jsonResponse(response, 202, { status: 'restarting' });
      restart?.();
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
      if (/^\/connections(?:\/|$)/.test(suffix)) {
        jsonResponse(response, 410, { error: { code: 'connection_retired', message: '旧连接接口已退役，请使用 connection-skills 及 mysql-query。' } });
        return;
      }
      const { rootPath: root } = resolveRegisteredWorkspace(workspaceId, { touch: request.method === 'GET' });
      for (const contribution of httpContributions) {
        if (typeof contribution.handle !== 'function') continue;
        const contributedResponse = await contribution.handle({
          request,
          suffix,
          searchParams: requestUrl.searchParams,
          root,
          workspaceId,
          authorizeRead: () => assertReadRequest(request, trustedOrigin, sessionToken),
          authorizeMutation: () => assertMutationRequest(request, trustedOrigin, sessionToken),
          authorizeWrite: () => assertWriteRequest(request, trustedOrigin, sessionToken),
          readBody: (allowed: any, label: any, maxBytes?: number) => readAllowedJsonBody(request, allowed, label, maxBytes),
          readJsonBody: (maxBytes?: number) => readJsonBody(request, maxBytes),
          readBinaryBody: (maxBytes: number) => readBinaryBody(request, maxBytes),
          submitTaskRead: (operation: any, taskId: any, input: any = {}, signal?: AbortSignal) => submitTaskRead(request, response, operation, root, taskId, input, signal),
          submitTaskWrite: (operation: any, input: any = {}) => submitTaskWrite(operation, root, input),
          respond: contributionRespond(response),
        });
        if (contributedResponse === true) return;
        if (contributedResponse) return jsonResponse(response, contributedResponse.status, contributedResponse.body);
      }
    }
    jsonResponse(response, 404, { error: { code: 'not_found', message: '请求的 Buildr Web 资源不存在。' } });
  };
}

export { BUILDR_WEB_HTTP_OPERATIONS, BUILDR_WEB_HTTP_SCHEMAS };
