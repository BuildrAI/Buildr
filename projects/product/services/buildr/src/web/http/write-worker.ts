import { parentPort } from 'node:worker_threads';

// The full runtime is loaded only when the first write arrives so the worker
// starts cheaply; write operations must run to completion once dispatched, so
// there is no cancellation channel.
let applications: Promise<typeof import('./write-worker-applications.ts')> | undefined;
if (!parentPort) throw new Error('Buildr Web write Worker requires a parent port.');
const workerPort = parentPort;
workerPort.on('message', async (message: any) => {
  try {
    applications ||= import('./write-worker-applications.ts');
    const value = await (await applications).runApplicationWrite(message);
    workerPort.postMessage({ id: message.id, ok: true, value });
  } catch (error: any) {
    workerPort.postMessage({ id: message?.id ?? null, ok: false, error: {
      code: error?.code || 'local_app_write_application_failed',
      status: Number.isInteger(error?.status) ? error.status : 500,
      message: error?.message || 'Buildr Web write Application failed.',
      ...(error?.details === undefined ? {} : { details: error.details }),
    } });
  }
});
