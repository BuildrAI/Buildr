import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  clearLocalAppInstance,
  acquireLocalAppStartLock,
  healthyLocalAppInstance,
  openDefaultBrowser,
  readLocalAppInstance,
  releaseLocalAppStartLock,
  waitForLocalAppInstance,
  writeLocalAppInstance,
  readLauncherIdentityFromEnvironment,
} from '../runtime/instance-manager.mjs';
import {
  listPreviews,
  readPreviewIdentityFromEnvironment,
  registerLocalAppPreviewResourceProvider,
  startPreview,
  stopPreview,
} from '../runtime/preview-manager.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../application/json-contracts.mjs';
import { pickWorkspaceDirectory } from '../runtime/directory-picker.mjs';
import { createBoundedLocalAppReadExecutor } from './read-executor.mjs';
import { createLocalAppScheduledMaintenance } from '../runtime/scheduled-maintenance.mjs';

const MAX_JSON_BODY_BYTES = 32 * 1024;
const STATIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web-dist');
const WORKSPACE_ID = '[0-9a-fA-F-]{36}';
const TASK_ID = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';
const TASK_QUERY_FIELDS = new Set(['q', 'project', 'service', 'status', 'hasChildren', 'hasRetrospective', 'retrospectiveState']);
const WORKSPACE_APP_ROUTE = new RegExp(`^/workspaces/${WORKSPACE_ID}(?:/overview|/settings|/articles(?:/${TASK_ID})?|/tasks(?:/${TASK_ID}(?:/changes/[A-Za-z0-9][A-Za-z0-9._-]*/${TASK_ID})?)?|/projects(?:/[A-Za-z0-9][A-Za-z0-9._-]*(?:/edit)?)?|/services(?:/[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*(?:/edit)?)?)?/?$`);
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

function apiError(response, error) {
  if (response.destroyed || response.writableEnded) return;
  const status = Number.isInteger(error.status) ? error.status : 500;
  jsonResponse(response, status, {
    error: {
      code: error.code || 'internal_error',
      message: status >= 500 ? 'Buildr 本地应用处理请求失败。' : error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  });
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
    const error = new Error('写请求必须来自当前 Buildr 本地应用。');
    error.code = 'origin_forbidden';
    error.status = 403;
    throw error;
  }
  if (request.headers['x-buildr-session'] !== sessionToken) {
    const error = new Error('Buildr 本地应用 session 已失效，请刷新页面。');
    error.code = 'session_forbidden';
    error.status = 403;
    throw error;
  }
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    const error = new Error('Buildr 本地应用请求 content type 必须是 application/json。');
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

function taskQueryInput(searchParams) {
  const input = {};
  for (const field of new Set(searchParams.keys())) {
    if (!TASK_QUERY_FIELDS.has(field)) {
      const error = new Error(`Task list 不支持 query 参数：${field}。`);
      error.code = 'task_api_query_forbidden'; error.status = 400; error.details = { field };
      throw error;
    }
    const values = searchParams.getAll(field);
    if (values.length !== 1) {
      const error = new Error(`Task list query 参数不能重复：${field}。`);
      error.code = 'task_api_query_invalid'; error.status = 400; error.details = { field };
      throw error;
    }
    input[field] = values[0];
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

function injectedIndexHtml(sessionToken, previewIdentity) {
  const indexPath = path.join(STATIC_ROOT, 'index.html');
  if (!fs.existsSync(indexPath)) {
    const error = new Error('Local App web dist 缺失，请先运行 npm run build:web。');
    error.code = 'web_dist_missing';
    error.status = 503;
    throw error;
  }
  return fs.readFileSync(indexPath, 'utf8')
    .replace('__BUILDR_SESSION_TOKEN__', sessionToken)
    .replace('__BUILDR_PREVIEW_IDENTITY__', previewIdentity ? encodeURIComponent(JSON.stringify(previewIdentity)) : '');
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

function ensureRegisteredTarget(runtime, targetRoot) {
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
  previewIdentity = null,
  onShutdown = null,
  readExecutor = null,
  scheduledMaintenanceFactory = createLocalAppScheduledMaintenance,
} = {}) {
  const initialWorkspaceId = ensureRegisteredTarget(runtime, targetRoot);
  const ownsReadExecutor = !readExecutor;
  const taskReadExecutor = readExecutor || createBoundedLocalAppReadExecutor();
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const healthSecret = instanceSecret || crypto.randomBytes(32).toString('hex');
  let origin = null;
  let closing = false;
  let scheduledMaintenance = null;

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
        textResponse(response, 200, injectedIndexHtml(sessionToken, previewIdentity), 'text/html; charset=utf-8');
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
        jsonResponse(response, 200, { schemaVersion: 'buildr.local-app-health/v1', status: closing ? 'stopping' : 'ready', pid: process.pid, launcherIdentity, previewIdentity });
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
        if (request.method === 'GET' && suffix === '/tasks') return jsonResponse(response, 200, runtime.queryTaskRecordViews(root, taskQueryInput(requestUrl.searchParams)));
        const taskMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})$`));
        if (request.method === 'GET' && taskMatch) return jsonResponse(response, 200, runtime.inspectTaskRecordView(root, taskMatch[1]));
        if (request.method === 'PATCH' && taskMatch) {
          assertWriteRequest(request, origin, sessionToken);
          const input = await readAllowedJsonBody(request, new Set(['expectedRecordDigest', 'title', 'intent', 'parentTaskId', 'addProjects', 'removeProjects', 'addServices', 'removeServices', 'addRetrospectiveSources', 'removeRetrospectiveSources']), 'Task update');
          if (!Object.hasOwn(input, 'expectedRecordDigest')) {
            const error = new Error('Task update 必须包含 expectedRecordDigest。'); error.code = 'task_record_digest_required'; error.status = 400; throw error;
          }
          return jsonResponse(response, 200, runtime.updateTaskRecord(root, taskMatch[1], input));
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
          const input = await readAllowedJsonBody(request, new Set(['operation', 'expectedPlanIdentity', 'plan', 'reason', 'summary']), 'Parent coordination');
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
        const taskCompleteMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/complete$`));
        if (request.method === 'POST' && taskCompleteMatch) {
          assertWriteRequest(request, origin, sessionToken);
          const input = await readAllowedJsonBody(request, new Set(['expectedRecordDigest', 'summary', 'noChange']), 'Task complete');
          if (!Object.hasOwn(input, 'expectedRecordDigest')) { const error = new Error('Task complete 必须包含 expectedRecordDigest。'); error.code = 'task_record_digest_required'; error.status = 400; throw error; }
          return jsonResponse(response, 200, runtime.completeTaskRecord(root, taskCompleteMatch[1], input));
        }
        const taskAbandonMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/abandon$`));
        if (request.method === 'POST' && taskAbandonMatch) {
          assertWriteRequest(request, origin, sessionToken);
          const input = await readAllowedJsonBody(request, new Set(['expectedRecordDigest', 'reason']), 'Task abandon');
          if (!Object.hasOwn(input, 'expectedRecordDigest')) { const error = new Error('Task abandon 必须包含 expectedRecordDigest。'); error.code = 'task_record_digest_required'; error.status = 400; throw error; }
          return jsonResponse(response, 200, runtime.abandonTaskRecord(root, taskAbandonMatch[1], input));
        }
        const projectMatch = suffix.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9._-]*)$/);
        if (request.method === 'GET' && projectMatch) return jsonResponse(response, 200, runtime.projectDetail(root, projectMatch[1]));
        if (request.method === 'PUT' && projectMatch) {
          assertWriteRequest(request, origin, sessionToken);
          return jsonResponse(response, 200, runtime.updateProjectMetadata(root, projectMatch[1], await readJsonBody(request)));
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
        if (request.method === 'POST' && suffix === '/prompts/task-review') {
          assertWriteRequest(request, origin, sessionToken);
          const input = await readAllowedJsonBody(request, new Set(['taskId', 'reviewType', 'projectCode', 'change']), 'Task Review prompt');
          return jsonResponse(response, 200, runtime.generateTaskReviewPrompt(root, input));
        }
        if (request.method === 'POST' && suffix === '/prompts/task-verification') {
          assertWriteRequest(request, origin, sessionToken);
          const input = await readAllowedJsonBody(request, new Set(['taskId', 'targetIdentity']), 'Task Verification prompt');
          return jsonResponse(response, 200, runtime.generateTaskVerificationPrompt(root, input));
        }
      }
      jsonResponse(response, 404, { error: { code: 'not_found', message: '请求的 Buildr 本地应用资源不存在。' } });
    }).catch((error) => apiError(response, error));
  });
  server.once('close', () => {
    scheduledMaintenance?.stop();
    if (ownsReadExecutor) void taskReadExecutor.close();
  });

  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const address = server.address();
      origin = `http://127.0.0.1:${address.port}`;
      try {
        if (!previewIdentity) {
          scheduledMaintenance = scheduledMaintenanceFactory(runtime);
          scheduledMaintenance.start();
        }
      } catch (error) {
        server.close();
        reject(error);
        return;
      }
      resolve({ server, url: origin, initialWorkspaceId, sessionToken, instanceSecret: healthSecret });
    });
  });
  return { server, ready };
}

export function registerLocalWorkspaceAppInterface(runtime) {
  registerLocalAppPreviewResourceProvider(runtime);
  async function startLocalWorkspaceApp(args) {
    runtime.assertNoUnknownOptions(args, new Set(['--target', '--port', '--no-open']), new Set(['--no-open']));
    const targetValue = runtime.optionValue(args, '--target', null);
    const targetRoot = targetValue ? path.resolve(targetValue) : null;
    const rawPort = runtime.optionValue(args, '--port', '0');
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid app port: ${rawPort}`);
    const noOpen = args.includes('--no-open');
    const launcherIdentity = readLauncherIdentityFromEnvironment();
    const previewIdentity = readPreviewIdentityFromEnvironment();
    let initialWorkspaceId = null;
    if (targetRoot) initialWorkspaceId = ensureRegisteredTarget(runtime, targetRoot);
    const recorded = readLocalAppInstance();
    const healthy = await healthyLocalAppInstance(recorded);
    if (healthy) {
      if (launcherIdentity && healthy.launcherIdentity && launcherIdentity.protocolVersion !== healthy.launcherIdentity.protocolVersion) {
        throw new Error(`已运行 Buildr App protocol v${healthy.launcherIdentity.protocolVersion} 与当前 launcher v${launcherIdentity.protocolVersion} 不兼容，请先退出旧实例。`);
      }
      const pageUrl = initialWorkspaceId ? `${healthy.url}/workspaces/${initialWorkspaceId}/` : healthy.url;
      if (!noOpen) openDefaultBrowser(pageUrl);
      console.log(`Buildr 本地应用已运行：${pageUrl}`);
      return { reused: true, url: pageUrl };
    }
    if (recorded) clearLocalAppInstance(recorded);
    const startLock = acquireLocalAppStartLock();
    if (!startLock.owner) {
      const started = await waitForLocalAppInstance();
      if (!started) throw new Error('另一个 Buildr 启动进程没有在预期时间内就绪，请稍后重试。');
      const pageUrl = initialWorkspaceId ? `${started.url}/workspaces/${initialWorkspaceId}/` : started.url;
      if (!noOpen) openDefaultBrowser(pageUrl);
      console.log(`Buildr 本地应用已运行：${pageUrl}`);
      return { reused: true, url: pageUrl };
    }
    const secret = crypto.randomBytes(32).toString('hex');
    let state = null;
    let instance = null;
    try {
      instance = createLocalWorkspaceServer(runtime, {
        port,
        instanceSecret: secret,
        launcherIdentity,
        previewIdentity,
        onShutdown: () => {
          if (state) clearLocalAppInstance(state);
          if (previewIdentity) process.exit(0);
        },
      });
      const ready = await instance.ready;
      state = { url: ready.url, secret, pid: process.pid, launcherIdentity };
      writeLocalAppInstance(runtime, state);
      releaseLocalAppStartLock(startLock);
      const pageUrl = initialWorkspaceId ? `${ready.url}/workspaces/${initialWorkspaceId}/` : ready.url;
      if (!noOpen) openDefaultBrowser(pageUrl);
      console.log(`Buildr 本地应用：${pageUrl}`);
      console.log('仅限本机访问；关闭浏览器不会退出服务，请在页面中选择“退出 Buildr”。');
      const cleanup = () => { clearLocalAppInstance(state); };
      process.once('exit', cleanup);
      process.once('SIGINT', () => instance.server.close(() => process.exit(0)));
      process.once('SIGTERM', () => instance.server.close(() => process.exit(0)));
      return { ...instance, reused: false, url: pageUrl };
    } catch (error) {
      releaseLocalAppStartLock(startLock);
      clearLocalAppInstance(state);
      instance?.server.close();
      throw new Error(`Buildr 本地应用启动失败：${error.message}`);
    }
  }

  async function manageLocalAppPreview(action, args) {
    if (action === 'start') {
      const [name, ...options] = args;
      if (!name) throw new Error('Usage: buildr app preview start <instance> [--task <task-id> --target <canonical-workspace>] [--port <port>] [--no-open] [--json]');
      const result = await startPreview(runtime, name, options);
      if (options.includes('--json')) console.log(JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.localAppPreview, result), null, 2));
      else console.log(`Buildr 开发预览已${result.status === 'reused' ? '复用' : '启动'}：${result.url}\n实例：${result.owner.instance}\nworktree：${result.owner.worktree}\n分支：${result.owner.branch}\nHEAD：${result.owner.head}${result.owner.dirty ? '（有未提交修改）' : ''}`);
      return result;
    }
    if (action === 'list') {
      runtime.assertNoUnknownOptions(args, new Set(['--json']), new Set(['--json']));
      const result = await listPreviews();
      if (args.includes('--json')) console.log(JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.localAppPreview, result), null, 2));
      else if (!result.previews.length) console.log('没有运行中的 Buildr 开发预览。');
      else result.previews.forEach((preview) => console.log(`${preview.instance}\t${preview.status}\t${preview.url || '-'}\t${preview.owner.worktree}`));
      return result;
    }
    if (action === 'stop') {
      const [name, ...options] = args;
      if (!name) throw new Error('Usage: buildr app preview stop <instance> [--task <task-id> --target <canonical-workspace>] [--json]');
      runtime.assertNoUnknownOptions(options, new Set(['--target', '--task', '--json']), new Set(['--json']));
      const target = runtime.optionValue(options, '--target', null);
      const taskId = runtime.optionValue(options, '--task', null);
      let caller = null;
      let environmentResource = null;
      if (target || taskId) {
        if (!target || !taskId) throw new Error('Task preview stop requires --target and --task together.');
        const workspaceRoot = path.resolve(target);
        const context = runtime.resolveTaskEnvironmentExecution(workspaceRoot, taskId);
        if (!context?.ready) throw new Error(context?.blocked?.message || 'Task preview stop requires a ready Task Environment.');
        runtime.assertTaskEnvironmentController(workspaceRoot, taskId);
        environmentResource = context.resources.find((resource) => resource.provider === 'local-app-preview' && resource.handle?.instance === name && resource.status !== 'released');
        if (!environmentResource) { const error = new Error(`Environment 没有 matching preview resource：${name}。`); error.code = 'preview_environment_resource_missing'; throw error; }
        caller = {
          taskId,
          workspaceRoot: context.workspaceRoot,
          environmentRoot: context.validationRoot,
          resourceId: environmentResource.id,
          resourceProvider: environmentResource.provider,
          resourceHandle: environmentResource.handle,
          resourceProviderIdentity: environmentResource.identity.providerIdentity,
        };
      }
      const result = await stopPreview(name, { caller, retainOwner: Boolean(environmentResource) });
      if (environmentResource) {
        result.environmentResource = runtime.releaseTaskEnvironmentResource(path.resolve(target), taskId, { id: environmentResource.id, provider: 'local-app-preview', probe: { status: 'blocked', identity: environmentResource.identity.providerIdentity, observedAt: new Date().toISOString(), diagnostic: 'Preview 已由 provider 认证停止。' } }).resource;
        await stopPreview(name, { caller });
      }
      if (options.includes('--json')) console.log(JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.localAppPreview, result), null, 2));
      else console.log(`Buildr 开发预览已停止：${result.instance}`);
      return result;
    }
    throw new Error(`未知 preview 操作：${action}`);
  }

  Object.assign(runtime, { startLocalWorkspaceApp, manageLocalAppPreview });
  return runtime;
}
