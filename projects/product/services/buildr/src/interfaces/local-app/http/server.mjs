import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { resolveProductResource } from '../../../infrastructure/product-resources/index.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../application/json-contracts.mjs';
import { pickWorkspaceDirectory } from '../runtime/directory-picker.mjs';
import { createBoundedLocalAppReadExecutor } from './read-executor.mjs';

const MAX_JSON_BODY_BYTES = 32 * 1024;
const STATIC_ROOT = resolveProductResource('product/web-dist');
const WORKSPACE_ID = '[0-9a-fA-F-]{36}';
const STATIC_CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.map', 'application/json; charset=utf-8'],
]);

function jsonResponse(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function textResponse(response, status, content, contentType) {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    // style-src allows 'unsafe-inline' so Ant Design 5 css-in-js / motion can apply
    // element styles; scripts and network stay same-origin (no CDN).
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
  response.end(content);
}

function binaryResponse(response, status, content, contentType) {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(content);
}

function uiPrototypeHtmlResponse(response, content) {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  });
  response.end(content);
}

function apiError(response, error) {
  if (response.destroyed || response.writableEnded) return;
  const status = Number.isInteger(error.status) ? error.status : 500;
  jsonResponse(response, status, {
    error: {
      code: error.code || 'internal_error',
      message: status >= 500 ? 'Buildr Web 处理请求失败。' : error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  });
}

function parentCoordinationBlocked(taskId, operation, error) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  return {
    status,
    payload: withJsonSchema(PUBLIC_JSON_SCHEMAS.parentCoordinationResult, {
      operation: operation || 'unknown', status: 'blocked', taskId, mode: 'unknown', plan: null,
      children: [], contributions: [], prerequisitesSatisfied: false, effects: [],
      diagnostic: {
        code: error.code || 'internal_error',
        message: status >= 500 ? 'Buildr Web 处理Parent coordination请求失败。' : error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
        nextAction: error.nextAction || '重新inspect Parent coordination后重试。',
      },
    }),
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BODY_BYTES) tooLarge = true;
      else chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) {
        const error = new Error('请求体超过允许大小。');
        error.code = 'request_body_too_large';
        error.status = 413;
        reject(error);
        return;
      }
      try {
        const content = Buffer.concat(chunks).toString('utf8');
        resolve(content ? JSON.parse(content) : {});
      } catch {
        const error = new Error('请求体必须是合法 JSON。');
        error.code = 'invalid_json';
        error.status = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function assertWriteRequest(request, origin, sessionToken) {
  if (request.headers.origin !== origin) {
    const error = new Error('写请求必须来自当前 Buildr Web。');
    error.code = 'origin_forbidden';
    error.status = 403;
    throw error;
  }
  if (request.headers['x-buildr-session'] !== sessionToken) {
    const error = new Error('Buildr Web session 已失效，请刷新页面。');
    error.code = 'session_forbidden';
    error.status = 403;
    throw error;
  }
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    const error = new Error('Buildr Web 请求 content type 必须是 application/json。');
    error.code = 'content_type_unsupported';
    error.status = 415;
    throw error;
  }
}

async function readAllowedJsonBody(request, allowed, label) {
  const input = await readJsonBody(request);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error(`${label} 请求必须是 JSON object。`);
    error.code = 'task_api_input_invalid';
    error.status = 400;
    throw error;
  }
  for (const field of Object.keys(input)) {
    if (['target', 'root', 'path'].includes(field)) {
      const error = new Error('Task API 不接受 filesystem path。');
      error.code = 'target_forbidden';
      error.status = 400;
      throw error;
    }
    if (!allowed.has(field)) {
      const error = new Error(`${label} 不支持字段：${field}。`);
      error.code = 'task_api_field_forbidden';
      error.status = 400;
      error.details = { field };
      throw error;
    }
  }
  return input;
}

function resolveDistFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.includes('\0')) return null;
  const relative = decoded.slice(1);
  if (!relative || relative.split('/').some((part) => part === '..')) return null;
  const resolved = path.resolve(STATIC_ROOT, relative);
  const rootWithSep = STATIC_ROOT.endsWith(path.sep) ? STATIC_ROOT : `${STATIC_ROOT}${path.sep}`;
  if (resolved !== STATIC_ROOT && !resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

function contentTypeFor(filePath) {
  return STATIC_CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

function injectedIndexHtml(sessionToken, previewIdentity, webProfile) {
  const indexPath = path.join(STATIC_ROOT, 'index.html');
  if (!fs.existsSync(indexPath)) {
    const error = new Error('Buildr Web dist 缺失，请先运行 npm run build:web。');
    error.code = 'web_dist_missing';
    error.status = 503;
    throw error;
  }
  const profile = ['released', 'development'].includes(webProfile?.profile) ? webProfile.profile : '';
  return fs.readFileSync(indexPath, 'utf8')
    .replace('__BUILDR_SESSION_TOKEN__', sessionToken)
    .replace('__BUILDR_PREVIEW_IDENTITY__', previewIdentity ? encodeURIComponent(JSON.stringify(previewIdentity)) : '')
    .replace('__BUILDR_WEB_PROFILE__', profile);
}

function serveDistAsset(response, pathname) {
  const filePath = resolveDistFile(pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const contentType = contentTypeFor(filePath);
  if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('javascript') || contentType.includes('svg')) {
    textResponse(response, 200, fs.readFileSync(filePath, 'utf8'), contentType);
  } else {
    binaryResponse(response, 200, fs.readFileSync(filePath), contentType);
  }
  return true;
}

function workspaceApiMatch(pathname) {
  return pathname.match(new RegExp(`^/api/v1/workspaces/(${WORKSPACE_ID})(/.*)?$`));
}

export function ensureRegisteredTarget(runtime, targetRoot) {
  if (!targetRoot) return null;
  const root = path.resolve(targetRoot);
  runtime.assertInitializedBuildrWorkspace(root);
  let registry = runtime.listRegisteredWorkspaces();
  const existing = registry.workspaces.find((entry) => entry.rootPath === root);
  if (!existing) registry = runtime.registerLocalWorkspace({ rootPath: root, revision: registry.revision });
  const entry = registry.workspaces.find((item) => item.rootPath === root);
  return entry?.workspace?.id || null;
}

export function createLocalWorkspaceServer(runtime, {
  targetRoot = null,
  port = 0,
  instanceSecret = null,
  launcherIdentity = null,
  productIdentity = null,
  webProfile = null,
  previewIdentity = null,
  onShutdown = null,
  readExecutor = null,
  httpContributions = runtime.__bootstrapContributions?.('http') || [],
} = {}) {
  const taskIdSources = [...new Set(httpContributions.map((contribution) => contribution.taskIdSource).filter(Boolean))];
  if (taskIdSources.length !== 1) {
    const error = new Error(`Buildr Web requires exactly one Task identity contribution; received ${taskIdSources.length}.`);
    error.code = 'bootstrap_http_task_identity_invalid';
    throw error;
  }
  const TASK_ID = taskIdSources[0];
  const WORKSPACE_APP_ROUTE = new RegExp(`^/workspaces/${WORKSPACE_ID}(?:/overview|/settings|/articles(?:/${TASK_ID})?|/tasks(?:/${TASK_ID}(?:/changes/[A-Za-z0-9][A-Za-z0-9._-]*/${TASK_ID})?)?|/projects(?:/[A-Za-z0-9][A-Za-z0-9._-]*(?:/edit)?)?|/services(?:/[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*(?:/edit)?)?)?/?$`);
  const initialWorkspaceId = ensureRegisteredTarget(runtime, targetRoot);
  const ownsReadExecutor = !readExecutor;
  const taskReadExecutor = readExecutor || createBoundedLocalAppReadExecutor();
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const healthSecret = instanceSecret || crypto.randomBytes(32).toString('hex');
  let origin = null;
  let closing = false;

  function submitTaskRead(request, response, operation, root, taskId, input = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.once('aborted', abort);
    response.once('close', abort);
    return taskReadExecutor.run(operation, { targetRoot: root, taskId, ...input, signal: controller.signal }).finally(() => {
      request.removeListener('aborted', abort);
      response.removeListener('close', abort);
    });
  }

  const server = http.createServer((request, response) => {
    Promise.resolve().then(async () => {
      const requestUrl = new URL(request.url || '/', origin || 'http://127.0.0.1');
      const pathname = requestUrl.pathname;
      if (closing && pathname !== '/api/v1/health') {
        jsonResponse(response, 503, { error: { code: 'app_shutting_down', message: 'Buildr 正在退出。' } });
        return;
      }
      if (request.method === 'GET' && (pathname === '/' || WORKSPACE_APP_ROUTE.test(pathname))) {
        textResponse(response, 200, injectedIndexHtml(sessionToken, previewIdentity, webProfile), 'text/html; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && serveDistAsset(response, pathname)) {
        return;
      }
      if (request.method === 'GET' && pathname === '/api/v1/health') {
        if (request.headers['x-buildr-instance'] !== healthSecret) {
          jsonResponse(response, 403, { error: { code: 'instance_forbidden', message: 'Buildr instance secret 无效。' } });
          return;
        }
        jsonResponse(response, 200, {
          schemaVersion: 'buildr.local-app-health/v1',
          status: closing ? 'stopping' : 'ready',
          pid: process.pid,
          launcherIdentity,
          productIdentity,
          webProfile,
          previewIdentity,
        });
        return;
      }
      if (request.method === 'GET' && pathname === '/api/v1/release-awareness') {
        const awareness = runtime.releaseAwareness({
          allowDevelopmentQuery: false,
          persistState: true,
          notify: true,
        });
        jsonResponse(response, 200, withJsonSchema(PUBLIC_JSON_SCHEMAS.releaseAwareness, awareness));
        return;
      }
      if (request.method === 'GET' && pathname === '/api/v1/workspaces') {
        jsonResponse(response, 200, runtime.listRegisteredWorkspaces());
        return;
      }
      if (request.method === 'POST' && pathname === '/api/v1/workspaces') {
        assertWriteRequest(request, origin, sessionToken);
        jsonResponse(response, 200, runtime.registerLocalWorkspace(await readJsonBody(request)));
        return;
      }
      if (request.method === 'POST' && pathname === '/api/v1/workspaces/pick') {
        assertWriteRequest(request, origin, sessionToken);
        const input = await readJsonBody(request);
        const rootPath = pickWorkspaceDirectory();
        if (!rootPath) {
          jsonResponse(response, 200, { canceled: true });
          return;
        }
        jsonResponse(response, 200, runtime.inspectLocalWorkspaceCandidate(rootPath, input.revision));
        return;
      }
      if (request.method === 'DELETE' && pathname === '/api/v1/workspaces') {
        assertWriteRequest(request, origin, sessionToken);
        jsonResponse(response, 200, runtime.removeRegisteredWorkspace(await readJsonBody(request)));
        return;
      }
      const removeMatch = pathname.match(new RegExp(`^/api/v1/workspaces/(${WORKSPACE_ID})$`));
      if (request.method === 'DELETE' && removeMatch) {
        assertWriteRequest(request, origin, sessionToken);
        jsonResponse(response, 200, runtime.removeRegisteredWorkspace({ ...(await readJsonBody(request)), workspaceId: removeMatch[1] }));
        return;
      }
      if (request.method === 'POST' && pathname === '/api/v1/app/quit') {
        assertWriteRequest(request, origin, sessionToken);
        closing = true;
        jsonResponse(response, 202, { status: 'stopping' });
        setImmediate(() => server.close(() => onShutdown?.()));
        return;
      }
      if (request.method === 'POST' && pathname === '/api/v1/app/quit-instance') {
        if (request.headers['x-buildr-instance'] !== healthSecret) {
          jsonResponse(response, 403, { error: { code: 'instance_forbidden', message: 'Buildr instance secret 无效。' } });
          return;
        }
        closing = true;
        jsonResponse(response, 202, { status: 'stopping' });
        setImmediate(() => server.close(() => onShutdown?.()));
        return;
      }
      if (request.method === 'POST' && pathname === '/api/v1/prompts/workspace-create') {
        assertWriteRequest(request, origin, sessionToken);
        jsonResponse(response, 200, runtime.generateWorkspaceCreatePrompt(await readJsonBody(request)));
        return;
      }

      const apiMatch = workspaceApiMatch(pathname);
      if (apiMatch) {
        if (requestUrl.searchParams.has('target') || requestUrl.searchParams.has('path') || requestUrl.searchParams.has('root')) {
          const error = new Error('Workspace API 只接受已登记 workspaceId，不接受 filesystem path。');
          error.code = 'target_forbidden';
          error.status = 400;
          throw error;
        }
        const workspaceId = apiMatch[1];
        const suffix = apiMatch[2] || '';
        const { rootPath: root } = runtime.resolveRegisteredWorkspace(workspaceId, { touch: request.method === 'GET' });
        if (request.method === 'GET' && suffix === '') return jsonResponse(response, 200, runtime.getWorkspace(root));
        if (request.method === 'GET' && suffix === '/getting-started') {
          return jsonResponse(response, 200, runtime.getWorkspaceGettingStarted(root));
        }
        if (request.method === 'PUT' && suffix === '') {
          assertWriteRequest(request, origin, sessionToken);
          return jsonResponse(response, 200, runtime.updateWorkspaceMetadata(root, await readJsonBody(request)));
        }
        if (request.method === 'GET' && suffix === '/projects') return jsonResponse(response, 200, runtime.listProjects(root));
        if (request.method === 'GET' && suffix === '/publications') return jsonResponse(response, 200, runtime.listPublications(root));
        const publicationMatch = suffix.match(new RegExp(`^/publications/(${TASK_ID})$`));
        if (request.method === 'GET' && publicationMatch) return jsonResponse(response, 200, runtime.publicationDetail(root, publicationMatch[1]));
        const publicationAssetMatch = suffix.match(new RegExp(`^/publications/(${TASK_ID})/assets/(.+)$`));
        if (request.method === 'GET' && publicationAssetMatch) {
          const asset = runtime.readPublicationAsset(root, publicationAssetMatch[1], decodeURIComponent(publicationAssetMatch[2]));
          return binaryResponse(response, 200, fs.readFileSync(asset.file), asset.contentType);
        }
        const taskApi = suffix === '/tasks' || suffix.startsWith('/tasks/');
        const taskExecutionRecordsMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/execution-records$`));
        const taskQueryAllowed = request.method === 'GET' && (suffix === '/tasks' || taskExecutionRecordsMatch);
        if (taskApi && requestUrl.searchParams.size > 0 && !taskQueryAllowed) {
          const error = new Error('Task API 不接受 query 参数。');
          error.code = 'task_api_query_forbidden';
          error.status = 400;
          throw error;
        }
        for (const contribution of httpContributions) {
          const contributedResponse = await contribution.handle({
            request,
            suffix,
            searchParams: requestUrl.searchParams,
            root,
            authorizeWrite: () => assertWriteRequest(request, origin, sessionToken),
            readBody: (allowed, label) => readAllowedJsonBody(request, allowed, label),
          });
          if (contributedResponse) return jsonResponse(response, contributedResponse.status, contributedResponse.body);
        }
        const taskOverviewMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/overview$`));
        if (request.method === 'GET' && taskOverviewMatch) {
          return jsonResponse(response, 200, await submitTaskRead(request, response, 'overview', root, taskOverviewMatch[1]));
        }
        const taskCoordinationMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/coordination$`));
        if (request.method === 'GET' && taskCoordinationMatch) {
          return jsonResponse(response, 200, await submitTaskRead(request, response, 'coordination', root, taskCoordinationMatch[1]));
        }
        if (request.method === 'PATCH' && taskCoordinationMatch) {
          assertWriteRequest(request, origin, sessionToken);
          let input = null;
          try {
            input = await readAllowedJsonBody(request, new Set(['operation', 'expectedPlanIdentity', 'plan', 'reason', 'summary']), 'Parent coordination');
            const operationFields = {
              record: new Set(['operation', 'plan']),
              reconcile: new Set(['operation', 'expectedPlanIdentity', 'plan', 'reason']),
              accept: new Set(['operation', 'expectedPlanIdentity', 'summary']),
            }[input.operation];
            if (operationFields) {
              const forbidden = Object.keys(input).find((field) => !operationFields.has(field));
              if (forbidden) { const error = new Error(`Parent coordination ${input.operation}.${forbidden} 不受支持。`); error.code = 'parent_coordination_field_forbidden'; error.status = 400; throw error; }
            }
            if (input.operation === 'record') return jsonResponse(response, 200, runtime.recordParentPlan(root, taskCoordinationMatch[1], { plan: input.plan }));
            if (input.operation === 'reconcile') return jsonResponse(response, 200, runtime.reconcileParentPlan(root, taskCoordinationMatch[1], { expectedPlanIdentity: input.expectedPlanIdentity, plan: input.plan, reason: input.reason }));
            if (input.operation === 'accept') return jsonResponse(response, 200, runtime.acceptParentCoordination(root, taskCoordinationMatch[1], { expectedPlanIdentity: input.expectedPlanIdentity, summary: input.summary }));
            const error = new Error('Parent coordination operation必须是record、reconcile或accept。'); error.code = 'parent_coordination_operation_invalid'; error.status = 400; throw error;
          } catch (error) {
            const blocked = parentCoordinationBlocked(taskCoordinationMatch[1], input?.operation, error);
            return jsonResponse(response, blocked.status, blocked.payload);
          }
        }
        const taskEnvironmentMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/environment$`));
        if (request.method === 'GET' && taskEnvironmentMatch) {
          runtime.inspectTaskRecord(root, taskEnvironmentMatch[1]);
          return jsonResponse(response, 200, runtime.readTaskEnvironmentCurrent(root, taskEnvironmentMatch[1]));
        }
        const taskDevelopmentMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/development$`));
        if (request.method === 'GET' && taskDevelopmentMatch) {
          return jsonResponse(response, 200, await submitTaskRead(request, response, 'development', root, taskDevelopmentMatch[1]));
        }
        const taskReviewsMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/reviews$`));
        if (request.method === 'GET' && taskReviewsMatch) {
          return jsonResponse(response, 200, await submitTaskRead(request, response, 'reviews', root, taskReviewsMatch[1]));
        }
        const taskRetrospectiveMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/retrospective$`));
        if (request.method === 'GET' && taskRetrospectiveMatch) {
          return jsonResponse(response, 200, runtime.inspectTaskRetrospective(root, taskRetrospectiveMatch[1]));
        }
        if (request.method === 'PATCH' && taskRetrospectiveMatch) {
          assertWriteRequest(request, origin, sessionToken);
          const input = await readAllowedJsonBody(request, new Set(['status', 'note', 'expectedCurrentDigest']), 'Task retrospective handle');
          if (!Object.hasOwn(input, 'expectedCurrentDigest')) {
            const error = new Error('Task retrospective handle 必须包含 expectedCurrentDigest。'); error.code = 'task_retrospective_digest_required'; error.status = 400; throw error;
          }
          return jsonResponse(response, 200, runtime.handleTaskRetrospective(root, taskRetrospectiveMatch[1], input));
        }
        const taskVerificationMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/verification$`));
        if (request.method === 'GET' && taskVerificationMatch) {
          return jsonResponse(response, 200, await submitTaskRead(request, response, 'verification', root, taskVerificationMatch[1]));
        }
        if (request.method === 'GET' && taskExecutionRecordsMatch) {
          const fields = [...new Set(requestUrl.searchParams.keys())];
          if (fields.some((field) => field !== 'view') || requestUrl.searchParams.getAll('view').length > 1) {
            const error = new Error('Task execution records 只接受一个 view query 参数。'); error.code = 'task_api_query_forbidden'; error.status = 400; throw error;
          }
          return jsonResponse(response, 200, await submitTaskRead(request, response, 'execution-records', root, taskExecutionRecordsMatch[1], { view: requestUrl.searchParams.get('view') || 'all' }));
        }
        const taskExecutionRecordDetailMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/execution-records/(${TASK_ID})$`));
        if (request.method === 'GET' && taskExecutionRecordDetailMatch) {
          return jsonResponse(response, 200, await submitTaskRead(request, response, 'execution-record-detail', root, taskExecutionRecordDetailMatch[1], { recordId: taskExecutionRecordDetailMatch[2] }));
        }
        const taskExecutionRecordBodyMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/execution-records/(${TASK_ID})/body/([^/]+)$`));
        if (request.method === 'GET' && taskExecutionRecordBodyMatch) {
          return jsonResponse(response, 200, await submitTaskRead(request, response, 'execution-record-body', root, taskExecutionRecordBodyMatch[1], { recordId: taskExecutionRecordBodyMatch[2], filename: decodeURIComponent(taskExecutionRecordBodyMatch[3]) }));
        }
        const taskChangeMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/changes/([A-Za-z0-9][A-Za-z0-9._-]*)/(${TASK_ID})$`));
        if (request.method === 'GET' && taskChangeMatch) {
          runtime.inspectTaskRecord(root, taskChangeMatch[1]);
          return jsonResponse(response, 200, runtime.taskScopedChangeDetail(root, taskChangeMatch[1], taskChangeMatch[2], taskChangeMatch[3]));
        }
        const taskUiPrototypesMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/ui-prototypes$`));
        if (request.method === 'GET' && taskUiPrototypesMatch) {
          return jsonResponse(response, 200, runtime.taskUiPrototypes(root, taskUiPrototypesMatch[1]));
        }
        const taskUiPrototypeMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/ui-prototypes/([a-f0-9]{32})$`));
        if (request.method === 'GET' && taskUiPrototypeMatch) {
          const prototype = runtime.taskUiPrototype(root, taskUiPrototypeMatch[1], taskUiPrototypeMatch[2]);
          return uiPrototypeHtmlResponse(response, prototype.html);
        }
        const taskDailyProgressMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/daily-progress$`));
        if (request.method === 'GET' && taskDailyProgressMatch) return jsonResponse(response, 200, runtime.inspectTaskDailyProgress(root, taskDailyProgressMatch[1]));
        const projectMatch = suffix.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9._-]*)$/);
        if (request.method === 'GET' && projectMatch) return jsonResponse(response, 200, runtime.projectDetail(root, projectMatch[1]));
        if (request.method === 'PUT' && projectMatch) {
          assertWriteRequest(request, origin, sessionToken);
          return jsonResponse(response, 200, runtime.updateProjectMetadata(root, projectMatch[1], await readJsonBody(request)));
        }
        const projectDailyProgressTodayMatch = suffix.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9._-]*)\/daily-progress$/);
        const projectDailyProgressDateMatch = suffix.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9._-]*)\/daily-progress\/(\d{4}-\d{2}-\d{2})$/);
        if (request.method === 'GET' && (projectDailyProgressTodayMatch || projectDailyProgressDateMatch)) {
          const extra = [...requestUrl.searchParams.keys()].filter((field) => field !== 'group');
          if (extra.length) {
            const error = new Error('每日演进 API 只接受 group query。');
            error.code = 'daily_progress_query_forbidden';
            error.status = 400;
            error.details = { field: extra[0] };
            throw error;
          }
          const project = (projectDailyProgressTodayMatch || projectDailyProgressDateMatch)[1];
          const date = projectDailyProgressDateMatch?.[2] || undefined;
          return jsonResponse(response, 200, runtime.inspectProjectDailyProgress(root, {
            project,
            date,
            group: requestUrl.searchParams.get('group') || undefined,
          }));
        }
        const projectDocumentMatch = suffix.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9._-]*)\/documents\/(.+)$/);
        if (request.method === 'GET' && projectDocumentMatch) {
          let documentPath = projectDocumentMatch[2];
          try {
            documentPath = decodeURIComponent(documentPath);
          } catch {
            throw Object.assign(new Error('项目文档路径无效。'), { code: 'project_document_path_forbidden', status: 400 });
          }
          return jsonResponse(response, 200, runtime.projectDocument(root, projectDocumentMatch[1], documentPath));
        }
        const servicesMatch = suffix.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9._-]*)\/services$/);
        if (request.method === 'GET' && servicesMatch) return jsonResponse(response, 200, runtime.listServices(root, servicesMatch[1]));
        const serviceDocumentMatch = suffix.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9._-]*)\/services\/([A-Za-z0-9][A-Za-z0-9._-]*)\/documents\/(.+)$/);
        if (request.method === 'GET' && serviceDocumentMatch) {
          let documentPath = serviceDocumentMatch[3];
          try {
            documentPath = decodeURIComponent(documentPath);
          } catch {
            throw Object.assign(new Error('服务文档路径无效。'), { code: 'service_document_path_forbidden', status: 400 });
          }
          return jsonResponse(response, 200, runtime.serviceDocument(root, serviceDocumentMatch[1], serviceDocumentMatch[2], documentPath));
        }
        const serviceMatch = suffix.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9._-]*)\/services\/([A-Za-z0-9][A-Za-z0-9._-]*)$/);
        if (request.method === 'GET' && serviceMatch) return jsonResponse(response, 200, runtime.serviceDetail(root, serviceMatch[1], serviceMatch[2]));
        if (request.method === 'PUT' && serviceMatch) {
          assertWriteRequest(request, origin, sessionToken);
          return jsonResponse(response, 200, runtime.updateServiceMetadata(root, serviceMatch[1], serviceMatch[2], await readJsonBody(request)));
        }
        if (request.method === 'POST' && suffix === '/prompts/project-create') {
          assertWriteRequest(request, origin, sessionToken);
          return jsonResponse(response, 200, runtime.generateProjectCreatePrompt(await readJsonBody(request)));
        }
        if (request.method === 'POST' && suffix === '/prompts/service-create') {
          assertWriteRequest(request, origin, sessionToken);
          return jsonResponse(response, 200, runtime.generateServiceCreatePrompt(root, await readJsonBody(request)));
        }
        if (request.method === 'POST' && suffix === '/prompts/start-work') {
          assertWriteRequest(request, origin, sessionToken);
          return jsonResponse(response, 200, runtime.generateStartWorkPrompt(root, await readJsonBody(request)));
        }
        if (request.method === 'POST' && suffix === '/prompts/task-verification') {
          assertWriteRequest(request, origin, sessionToken);
          const input = await readAllowedJsonBody(request, new Set(['taskId', 'targetIdentity']), 'Task Verification prompt');
          return jsonResponse(response, 200, runtime.generateTaskVerificationPrompt(root, input));
        }
      }
      jsonResponse(response, 404, { error: { code: 'not_found', message: '请求的 Buildr Web 资源不存在。' } });
    }).catch((error) => apiError(response, error));
  });
  server.once('close', () => {
    if (ownsReadExecutor) void taskReadExecutor.close();
  });

  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const address = server.address();
      origin = `http://127.0.0.1:${address.port}`;
      resolve({ server, url: origin, initialWorkspaceId, sessionToken, instanceSecret: healthSecret });
    });
  });
  return { server, ready };
}
