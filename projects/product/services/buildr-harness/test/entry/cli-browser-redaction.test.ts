import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const core = 'data:text/javascript,' + encodeURIComponent(`
export let disconnects=0;
export const resolveHarnessProfile=()=>({productId:'buildr-harness',profile:'released',dataRoot:'/fixture/profile',domainIdentity:'fixture',entryIdentity:'fixture'});
export const prepareAgentRuntimeAsync=async()=>{};
export const activateAgentRuntime=async()=>{};
export const connectHarnessProcess=async()=>({
  web:{enable:async()=>({ready:true,origin:'http://127.0.0.1:123'}),login:async()=>({url:'http://127.0.0.1:123/#ticket=must-not-leak'})},
  lifecycle:{identity:async()=>({runtime:{digest:'fixture'},instanceId:'fixture',generation:'fixture'})},
  disconnect:async()=>{disconnects++;}
});`);
const browser = 'data:text/javascript,' + encodeURIComponent(`
export function execFile(file,args,options,callback){callback(new Error('Command failed: '+file+' '+args.join(' ')));}`);
registerHooks({resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/src/cli.ts')) {
    if (specifier === './index.ts') return {url: core, shortCircuit: true};
    if (specifier === 'node:child_process') return {url: browser, shortCircuit: true};
  }
  return next(specifier, context);
}});
const {main} = await import('../../src/cli.ts');
test('browser-open failures do not disclose the one-use login ticket and always close the caller', async t => {
  const previous = process.env.BUILDR_LAUNCHER_NO_OPEN;
  delete process.env.BUILDR_LAUNCHER_NO_OPEN;
  t.after(() => {if (previous === undefined) delete process.env.BUILDR_LAUNCHER_NO_OPEN; else process.env.BUILDR_LAUNCHER_NO_OPEN = previous;});
  await assert.rejects(main(['web', '--data-root', '/fixture/profile']), (error: unknown) => {
    assert.equal((error as {code?: string}).code, 'harness_browser_open_failed');
    assert.doesNotMatch(String((error as Error).message), /must-not-leak|#ticket=/u);
    return true;
  });
  assert.equal((await import(core)).disconnects, 1);
});
