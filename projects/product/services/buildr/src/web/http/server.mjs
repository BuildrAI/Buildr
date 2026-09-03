import crypto from 'node:crypto';
import http from 'node:http';

import { createBoundedBuildrWebReadExecutor } from './read-executor.mjs';
import { apiError } from './responses.mjs';
import { createLocalWorkspaceRequestRouter } from './router.mjs';

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
  ensureRegisteredTarget = runtime.ensureRegisteredTarget,
  staticRoot = null,
} = {}) {
  if (typeof ensureRegisteredTarget !== 'function') throw new TypeError('Buildr Web Host requires the Workspace registration port.');
  const taskIdSources = [...new Set(httpContributions.map((contribution) => contribution.taskIdSource).filter(Boolean))];
  if (taskIdSources.length !== 1) {
    const error = new Error(`Buildr Web requires exactly one Task identity contribution; received ${taskIdSources.length}.`);
    error.code = 'bootstrap_http_task_identity_invalid';
    throw error;
  }

  const initialWorkspaceId = ensureRegisteredTarget(targetRoot);
  const ownsReadExecutor = !readExecutor;
  const taskReadExecutor = readExecutor || createBoundedBuildrWebReadExecutor();
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const healthSecret = instanceSecret || crypto.randomBytes(32).toString('hex');
  let origin = null;
  let closing = false;
  let routeRequest = null;

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
    Promise.resolve().then(() => routeRequest(request, response)).catch((error) => apiError(response, error));
  });
  routeRequest = createLocalWorkspaceRequestRouter({
    runtime,
    taskIdPattern: taskIdSources[0],
    sessionToken,
    healthSecret,
    launcherIdentity,
    productIdentity,
    webProfile,
    previewIdentity,
    httpContributions,
    origin: () => origin,
    isClosing: () => closing,
    shutdown: () => {
      closing = true;
      setImmediate(() => server.close(() => onShutdown?.()));
    },
    submitTaskRead,
    staticRoot,
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
