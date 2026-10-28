import { parentPort } from 'node:worker_threads';
import path from 'node:path';
import { createConnectionCatalog } from '../../modules/connection-skills/application/catalog.ts';
import { readConnectionSkillSources, readConnectionSkillFile, readConnectionSkillFiles } from '../../modules/agent-assets/application/connection-skill-source.ts';

// Keep the fixed pool cheap to start. The full runtime is loaded only by reads
// that need it; source proof never reads instances, credentials or task stores.
const catalog = createConnectionCatalog({ assets: { readSkills: readConnectionSkillSources, readSkillFile: readConnectionSkillFile, readSkillFiles: readConnectionSkillFiles } });
let applications: Promise<typeof import('./read-worker-applications.ts')> | undefined;
if (!parentPort) throw new Error('Buildr Web read Worker requires a parent port.');
const workerPort = parentPort;
let closing = false;
let active = 0;
workerPort.on('message', async (message: any) => {
  if (message?.type === 'close') {
    closing = true;
    if (!active) workerPort.close();
    return;
  }
  if (closing) return;
  active++;
  try {
    let value;
    if (message?.operation === 'connection-catalog') {
      const allowed = new Set(['id', 'operation', 'targetRoot', 'taskId']);
      if (typeof message.targetRoot !== 'string' || !path.isAbsolute(message.targetRoot) || message.taskId !== 'connection-directory' || Object.keys(message).some(field => !allowed.has(field))) {
        throw Object.assign(new Error('Buildr Web read Worker input invalid.'), { code: 'local_app_read_input_invalid', status: 400 });
      }
      value = catalog.list(message.targetRoot);
    } else {
      applications ||= import('./read-worker-applications.ts');
      value = await (await applications).runApplicationRead(message);
    }
    workerPort.postMessage({ id: message.id, ok: true, value });
  } catch (error: any) {
    workerPort.postMessage({ id: message?.id ?? null, ok: false, error: {
      code: error?.code || 'local_app_read_application_failed',
      status: Number.isInteger(error?.status) ? error.status : 500,
      message: error?.message || 'Buildr Web read Application failed.',
      ...(error?.details === undefined ? {} : { details: error.details }),
    } });
  } finally {
    active--;
    if (closing && !active) workerPort.close();
  }
});
