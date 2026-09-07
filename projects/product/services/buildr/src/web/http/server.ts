import crypto from 'node:crypto';
import http from 'node:http';

import { createBoundedBuildrWebReadExecutor } from './read-executor.ts';
import { apiError } from './responses.ts';
import { createLocalWorkspaceRequestRouter } from './router.ts';

export function createLocalWorkspaceServer(runtime: any, {
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
}: any = {}) {
  if (typeof ensureRegisteredTarget !== 'function') throw new TypeError('Buildr Web Host requires the Workspace registration port.');
  const taskIdSources = [...new Set(httpContributions.map((contribution: any) => contribution.taskIdSource).filter(Boolean))];
  if (taskIdSources.length !== 1) {
    const error: Error & Record<string, any> = new Error(`Buildr Web requires exactly one Task identity contribution; received ${taskIdSources.length}.`);
    error.code = 'bootstrap_http_task_identity_invalid';
    throw error;
  }

  const initialWorkspaceId = ensureRegisteredTarget(targetRoot);
  const ownsReadExecutor = !readExecutor;
  const taskReadExecutor = readExecutor || createBoundedBuildrWebReadExecutor();
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const healthSecret = instanceSecret || crypto.randomBytes(32).toString('hex');
  let origin: any = null;
  let closing = false;
  let routeRequest: any = null;

  function submitTaskRead(request: any, response: any, operation: any, root: any, taskId: any, input: any = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.once('aborted', abort);
    response.once('close', abort);
    return taskReadExecutor.run(operation, { targetRoot: root, taskId, ...input, signal: controller.signal }).finally(() => {
      request.removeListener('aborted', abort);
      response.removeListener('close', abort);
    });
  }

  const server = http.createServer((request: any, response: any) => {
    Promise.resolve().then(() => routeRequest(request, response)).catch((error: any) => apiError(response, error));
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

  const ready: Promise<any> = new Promise((resolve: any, reject: any) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Buildr Web server did not bind a TCP address.');
      origin = `http://127.0.0.1:${address.port}`;
      resolve({ server, url: origin, initialWorkspaceId, sessionToken, instanceSecret: healthSecret });
    });
  });
  return { server, ready };
}
