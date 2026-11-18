import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {prepareDevelopmentAgent} from './prepare-development-agent.ts';

/** A fresh process resolves the newly prepared public package, not a cached
 * module held by the long-running supervisor. Never replay user operations. */
export async function updateDevelopmentHarness(dataRoot: string, prepare = true) {
  if (prepare) prepareDevelopmentAgent({build: true, buildWeb: false});
  const {generateDevelopmentWebDtos} = await import('./prepare-development-web.ts');
  await generateDevelopmentWebDtos();
  const {activateAgentServiceRuntime} = await import('../../src/modules/agent-service/application/activate-runtime.ts');
  const {prepareAgentRuntimeAsync, observeAgentProcess} = await import('@buildr-ai/buildr-harness');
  const runtime = await prepareAgentRuntimeAsync({dataRoot});
  try {
    const result = await activateAgentServiceRuntime({dataRoot, profileId: 'development', runtime});
    console.log(JSON.stringify({status: 'ready', current: result.currentDigest, target: result.targetDigest, generation: result.generation}));
  } catch (error: any) {
    let current: string | null = null;
    try {
      current = (await observeAgentProcess({dataRoot, profileId: 'development'}))?.identity.runtime.digest ?? null;
    } catch { /* An unavailable observer is unknown, not proof of rollback. */ }
    console.error(JSON.stringify({status: 'unconfirmed', current, target: runtime.digest, code: error.code ?? 'development_harness_update_failed'}));
    throw error;
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  updateDevelopmentHarness(process.argv[2]!, process.argv[3] !== '--no-build').catch(error => { console.error(error.message); process.exitCode = 1; });
}
