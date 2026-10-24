import crypto from 'node:crypto';
import http from 'node:http';
import process from 'node:process';

import { spawnBuildrWebRestartSuccessor } from '../application/restart-web-handoff.ts';
import { createBoundedBuildrWebReadExecutor } from './read-executor.ts';
import { apiError } from './responses.ts';
import { createLocalWorkspaceRequestRouter } from './router.ts';

export function createLocalWorkspaceServer(runtime: any, {
  onReady = null,
  targetRoot = null,
  port = 0,
  instanceSecret = null,
  launcherIdentity = null,
  productIdentity = null,
  webProfile = null,
  previewIdentity = null,
  onShutdown = null,
  beforeShutdown = null,
  spawnSuccessor = null,
  readExecutor = null,
  httpContributions = runtime.__bootstrapContributions?.('http') || [],
  ensureRegisteredTarget = runtime.ensureRegisteredTarget,
  resolveRegisteredWorkspace = runtime.resolveRegisteredWorkspace,
  staticRoot = null,
}: any = {}) {
  if (typeof ensureRegisteredTarget !== 'function') throw new TypeError('Buildr Web Host requires the Workspace registration port.');
  if (typeof resolveRegisteredWorkspace !== 'function') throw new TypeError('Buildr Web Host requires the Workspace resolution port.');
  const taskIdSources = [...new Set(httpContributions.map((contribution: any) => contribution.taskIdSource).filter(Boolean))];
  if (taskIdSources.length !== 1) {
    const error: Error & Record<string, any> = new Error(`Buildr Web requires exactly one Task identity contribution; received ${taskIdSources.length}.`);
    error.code = 'bootstrap_http_task_identity_invalid';
    throw error;
  }

  const initialWorkspaceId = ensureRegisteredTarget(targetRoot);
  const launchSuccessor = typeof spawnSuccessor === 'function' ? spawnSuccessor : spawnBuildrWebRestartSuccessor;
  const ownsReadExecutor = !readExecutor;
  const taskReadExecutor = readExecutor || createBoundedBuildrWebReadExecutor({ warm: 1 });
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const healthSecret = instanceSecret || crypto.randomBytes(32).toString('hex');
  let origin: any = null;
  let closing = false;
  let restartRequested = false;
  let routeRequest: any = null;
  let shutdownPromise: Promise<void> | null = null;
  let resourceShutdown: Promise<void> | null = null;

  function closeResources(): Promise<void> {
    resourceShutdown ||= Promise.resolve().then(() => beforeShutdown?.());
    return resourceShutdown;
  }

  function shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    closing = true;
    shutdownPromise = (async () => {
      let cleanupError: unknown;
      try {
        await closeResources();
      } catch (error) {
        cleanupError = error;
      }
      await new Promise<void>(resolve => server.close(() => resolve()));
      await onShutdown?.(cleanupError);
      if (cleanupError) throw cleanupError;
    })();
    return shutdownPromise;
  }

  function submitTaskRead(request: any, response: any, operation: any, root: any, taskId: any, input: any = {}, sharedSignal?: AbortSignal) {
    if (sharedSignal) return taskReadExecutor.run(operation, { targetRoot: root, taskId, ...input, signal: sharedSignal });
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
    resolveRegisteredWorkspace,
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
      setImmediate(() => { void shutdown().catch(error => { console.error('Buildr Web resource shutdown failed:', error); process.exitCode = 1; }); });
    },
    restartRequested: () => restartRequested,
    restart: () => {
      // A restart keeps health 'ready': the successor must be able to confirm
      // this instance through its authenticated health proof until quit-instance.
      // Only the restart action itself is gated here.
      restartRequested = true;
      setImmediate(() => {
        try {
          launchSuccessor({
            url: origin,
            secret: healthSecret,
            pid: process.pid,
            launcherIdentity,
            productIdentity,
            webProfile,
          });
        } catch (error) {
          console.error('Buildr Web restart successor did not start:', error);
        }
      });
    },
    submitTaskRead,
    staticRoot,
  });
  let hostWasListening = false;
  server.once('listening', () => { hostWasListening = true; });
  server.once('close', () => {
    if (ownsReadExecutor) void taskReadExecutor.close();
    if (hostWasListening) void closeResources().catch(error => console.error('Buildr Web resource shutdown failed:', error));
  });

  const ready: Promise<any> = new Promise((resolve: any, reject: any) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      onReady?.();
      server.removeListener('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Buildr Web server did not bind a TCP address.');
      origin = `http://127.0.0.1:${address.port}`;
      resolve({ server, url: origin, initialWorkspaceId, sessionToken, instanceSecret: healthSecret });
    });
  });
  return { server, ready, shutdown };
}
