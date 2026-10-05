/**
 * Runner-owned capture and direct-event integration. Exact event windows and installation status are fixtures;
 * capture provider, subprocess stdin, the current Buildr CLI, assets, and source validation are real.
 * This does not prove Session persistence/IPC, installation discovery, or desktop activation.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sourceRecord } from '../../plugin/source-gateway.ts';
import { createEventSourceCapture } from '../../plugin/source-capture.ts';
import { recordedSourceSummary } from '../../plugin/src/event-sources.ts';
import { buildSkillProjectionReceipt, renderSkillProjectionReceipt } from '../../../buildr/src/modules/agent-assets/infrastructure/runtime/skills/projection-files.ts';
import type { SourceRecordRequest } from '../../plugin/src/source-types.ts';
import type { SourceProcessDependencies } from '../../plugin/source-process.ts';

const buildrRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../buildr');
const YAML = createRequire(path.join(buildrRoot, 'package.json'))('yaml');
const runnerRoot = process.env.BUILDR_SMOKE_ROOT;
const workspaceEntry = process.env.BUILDR_SMOKE_WORKSPACE_ROOT;
const appData = process.env.BUILDR_APP_DATA_DIR;
const productData = process.env.BUILDR_PRODUCT_DATA_DIR;
assert.ok(runnerRoot && workspaceEntry && appData && productData, 'must use the official isolated smoke runner');
assert.ok(fs.statSync(path.join(runnerRoot, '.buildr-smoke-owner')).isFile(), 'runner ownership required');
for (const directory of [workspaceEntry, appData, productData]) {
  const relative = path.relative(runnerRoot, directory);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'test roots must stay in runner scope');
}
const cli = path.join(buildrRoot, 'bin/buildr.mjs');
const runSetup = (args: string[]) => {
  const child = spawnSync(process.execPath, [cli, ...args], { cwd: buildrRoot, env: process.env, encoding: 'utf8', timeout: 30_000 });
  assert.equal(child.status, 0, child.stderr); return child.stdout;
};
runSetup(['init', '--source-only', '--target', workspaceEntry, '--name', 'plugin-source-integration', '--description', 'isolated passive source gateway', '--profile', 'personal']);
const workspace = fs.realpathSync(workspaceEntry);
const write = (relative: string, content: string) => {
  const target = path.join(workspace, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content);
};
const sha = (content: string) => `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
const rootAgents = fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf8') + '\n工作空间自有补充，不属于 Buildr 核心区块。\n';
write('AGENTS.md', rootAgents);
const manifest = YAML.parse(fs.readFileSync(path.join(workspace, 'skills/manifest.yml'), 'utf8'));
const workspaceId = manifest.workspaceId;
assert.equal(typeof workspaceId, 'string');
const assetIdentity = 'fixture:skill:gateway-proof';
const sourceIdentity = 'workspace:fixture:gateway-proof';
manifest.skills.push({ id: 'gateway-proof', path: 'fixture/gateway-proof', source: 'workspace', assetIdentity, sourceIdentity, enabled: true, description: 'isolated gateway receipt' });
write('skills/manifest.yml', YAML.stringify(manifest));
const skillBody = '---\nname: gateway-proof\ndescription: isolated direct business query\n---\n# 当前技能\n\n只读对象正文。\n';
write('skills/fixture/gateway-proof/SKILL.md', skillBody);
write('.agents/skills/gateway-proof/SKILL.md', skillBody);
const receipt = buildSkillProjectionReceipt({ adapterId: 'agents-standard', destination: 'workspace', skillId: 'gateway-proof', runtimePath: 'gateway-proof', sources: ['.'], assetIdentity, sourceIdentity, sourceWorkspaceId: workspaceId, sourceDigest: sha(skillBody), renderDigest: sha(skillBody), files: [{ path: 'SKILL.md', integrity: sha(skillBody), executable: false }] });
write('.buildr/agent-runtime/workspace/agents-standard/skill-projection-ownership-receipts/gateway-proof.json', renderSkillProjectionReceipt(receipt));
write('ordinary-buildr-source.ts', 'export const ordinary = true;\n');
write('.env', 'PRIVATE_SOURCE_MARKER=do-not-leak-gateway-fixture\n');
const serviceRelative = 'projects/product/services/example';
const serviceCwd = path.join(workspace, serviceRelative);
write(serviceRelative + '/AGENTS.md', '# Service-owned instructions\n\nNot the root managed block.\n');

function snapshot(root: string) {
  const result: Record<string, { digest: string; size: number; mtimeMs: number }> = {};
  function visit(directory: string, prefix = '') {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      assert.equal(entry.isSymbolicLink(), false, 'owned snapshot never follows a symlink');
      const target = path.join(directory, entry.name); const relative = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) visit(target, relative);
      else { const info = fs.statSync(target); assert.ok(info.isFile()); result[relative] = { digest: sha(fs.readFileSync(target).toString('base64')), size: info.size, mtimeMs: info.mtimeMs }; }
    }
  }
  visit(root); return result;
}
const before = { workspace: snapshot(workspace), app: snapshot(appData), product: snapshot(productData) };
let statusQueries = 0; let sourceProcesses = 0;
const processDependencies: SourceProcessDependencies = {
  environment: process.env,
  timeoutMs: 20_000,
  exec: async (file, args) => {
    assert.equal(file, process.execPath); assert.deepEqual(args, [cli, 'installation', 'status', '--json']);
    statusQueries++;
    return { stdout: JSON.stringify({ schemaVersion: 'buildr.installation-status/v1', channels: { npm: { status: 'installed', identity: { package: '@buildr-ai/buildr', channel: 'npm', ownershipIdentity: 'fixture-bound-current-cli', version: 'fixture', protocolIdentity: 'fixture-v1' } } }, instances: { released: { status: 'absent' } } }) };
  },
  runInput: (file, args, options, input) => {
    sourceProcesses++;
    assert.equal(file, process.execPath);
    assert.deepEqual(args.slice(0, 5), [cli, 'agent-assets', 'source', 'inspect', '--target']);
    assert.deepEqual(args.slice(-3), ['--input', '-', '--json']);
    assert.equal(options.shell, false);
    assert.equal(options.env?.BUILDR_APP_DATA_DIR, undefined, 'product adapter still strips inherited Buildr environment');
    assert.equal(options.env?.BUILDR_PRODUCT_DATA_DIR, undefined);
    // Restore only validated runner-owned profile paths for this test process adapter. The production
    // environment policy is unchanged; no default installation/profile query is executed in this test.
    const environment = { ...options.env, BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: productData, BUILDR_LOCAL_APP_NO_OPEN: '1' };
    return new Promise((resolve, reject) => {
      const child = execFile(file, args, { ...options, env: environment }, (error, stdout, stderr) => {
        if (error) reject(error); else { assert.equal(stderr, ''); resolve({ stdout, stderr }); }
      });
      assert.ok(child.stdin);
      child.stdin.on('error', reject);
      child.stdin.end(input, 'utf8');
    });
  },
};
const binding = { nodeExecutable: process.execPath, cliEntry: cli };
const capture=createEventSourceCapture({channel:'npm',processDependencies,resolveBinding:async()=>binding});
const eventHint=(relative:string)=>{const locator=path.join(workspace,relative),content=fs.readFileSync(locator,'utf8');return {kind:'rule' as const,action:'read' as const,name:path.basename(locator),locator:{path:locator},rawDigest:{algorithm:'sha256' as const,digest:sha(content).slice(7)},content,renderedContent:content,contentRefs:[{block:0,start:0,end:content.length,unit:'utf16' as const}],completeness:'complete' as const};};
const requestFor=(hint:any)=>({hint,agent:{session:{header:{cwd:workspace}}} as any,signal:new AbortController().signal});
const paths=['AGENTS.md','.agents/skills/gateway-proof/SKILL.md','ordinary-buildr-source.ts','.env',serviceRelative+'/AGENTS.md'];
const started=performance.now();
const captures=[];for(const relative of paths) captures.push(await capture(requestFor(eventHint(relative))));
const captureDurationMs=Math.round(performance.now()-started);
assert.deepEqual(captures.map(value=>value.status),['confirmed','not-applicable','not-applicable','unknown','not-applicable']);
const rule=captures[0];assert.equal(rule.mixed,true);assert.equal(rule.matches[0].providedBy,'buildr');assert.equal(rule.matches[0].completeness,'complete');
assert.equal(JSON.stringify(captures).includes('工作空间自有补充'),false);assert.equal(JSON.stringify(captures).includes('只读对象正文'),false);assert.equal(JSON.stringify(captures).includes('do-not-leak-gateway-fixture'),false);
assert.equal(sourceProcesses,5,'only actual capture consults source CLI');
const actualVersion=runSetup(['version','--json']);
const missingArgs=['task','inspect','fixture-does-not-exist','--target',workspace,'--json'];
const actualFailure=spawnSync(process.execPath,[cli,...missingArgs],{cwd:workspace,env:process.env,encoding:'utf8',timeout:30_000});assert.notEqual(actualFailure.status,0);
const commandHint=(args:string[])=>({kind:'command',action:'call',name:'bash',command:{text:[process.execPath,cli,...args].map(word=>'"'+word+'"').join(' '),cwd:workspace},completeness:'none'});
const success=await capture(requestFor(commandHint(['version','--json'])));
const failed=await capture(requestFor(commandHint(missingArgs)));
assert.equal(success.status,'confirmed');assert.equal(failed.status,'confirmed');
const versionSource={...success,execution:{outcome:'succeeded',exitCode:0}};
const failureSource={...failed,execution:{outcome:'failed',exitCode:actualFailure.status}};
const events=[
 {seq:20,type:'tool/result',data:{eventSources:rule,message:{toolCallId:'rule-call',isError:false,content:[{type:'text',text:rootAgents}]},meta:{path:path.join(workspace,'AGENTS.md')}}},
 {seq:21,type:'tool/result',data:{eventSources:versionSource,message:{toolCallId:'version-call',isError:false,content:[{type:'text',text:actualVersion}]}}},
 {seq:22,type:'tool/result',data:{eventSources:failureSource,message:{toolCallId:'failure-call',isError:false,content:[{type:'text',text:'PRIVATE CLI USER BODY'}]}}},
 {seq:23,type:'tool/result',data:{message:{toolCallId:'old-call',isError:false,content:[{type:'text',text:rootAgents}]},meta:{path:path.join(workspace,'AGENTS.md')}}},
];
const stored=JSON.parse(JSON.stringify(events));
const request=(index:number):SourceRecordRequest=>({sessionId:'captured-session',record:{recordId:'record-'+index,kind:'tool',transient:false,callId:['rule-call','version-call','failure-call','old-call'][index],eventRefs:[{sessionId:'captured-session',seq:20+index}],eventSources:[{seq:20+index,sources:stored[index].data.eventSources}]}});
const summary=recordedSourceSummary(request(0).record);assert.equal(summary.ready,true);assert.equal(summary.marker?.basis,'recorded-source');
const sourceProcessesBeforeView=sourceProcesses,statusBeforeView=statusQueries;
const originalReader={readEvents:async(address:any)=>({session:{id:address.sessionId},events:address.seqs.map((seq:number)=>stored.find((event:any)=>event.seq===seq))})};
const viewStarted=performance.now();
const views=[];for(let index=0;index<4;index++)views.push(await sourceRecord(request(index),originalReader));
const viewDurationMs=Math.round(performance.now()-viewStarted);
assert.ok(views.every(view=>view.ready));
assert.deepEqual(views.map(view=>view.marker?.status),['confirmed','confirmed','confirmed','unknown']);
assert.equal(views[0].ready && views[0].result.schemaVersion,'buildr.dsh-event-source-result/v1');
if(!views[0].ready)throw Error('unexpected');
const content=views[0].result.items[0].objects[0].observed.content!;
assert.ok(content.includes('<!-- buildr:required begin -->'));assert.ok(content.endsWith('<!-- buildr:required end -->'));
assert.equal(content.includes('工作空间自有补充'),false);
assert.equal(views[1].participation?.[0].outcome,'succeeded');assert.equal(views[2].participation?.[0].outcome,'failed');
assert.equal(JSON.stringify(views).includes('PRIVATE CLI USER BODY'),false);
assert.equal(views[3].ready && views[3].diagnostics?.[0].code,'source-not-captured');
assert.equal(sourceProcesses,sourceProcessesBeforeView,'viewing never runs a current source subprocess');
assert.equal(statusQueries,statusBeforeView,'viewing never resolves current installation');
assert.deepEqual({workspace:snapshot(workspace),app:snapshot(appData),product:snapshot(productData)},before,'capture and view have no source/profile mutations');
const coreFile=path.join(workspace,'AGENTS.md');fs.renameSync(coreFile,coreFile+'.hidden');
try{const again=await sourceRecord(request(0),originalReader);assert.deepEqual(again,views[0],'saved source/body does not depend on current asset presence');}finally{fs.renameSync(coreFile+'.hidden',coreFile);}
console.log(JSON.stringify({schemaVersion:'buildr.plugin-source-business-smoke/v1',status:'passed',queries:sourceProcesses,queryDurationMs:{capture:captureDurationMs,read:viewDurationMs},effects:[],checks:['actual-capture-metadata-cli-stdin','raw-version-and-mixed-fragment-proof','managed-skill-not-provided','ordinary-and-secret-exclusion','real-cli-success-and-failed-exit','saved-metadata-json-roundtrip','missing-source-not-captured','direct-view-zero-source-processes','current-asset-missing-does-not-break-reading','no-added-user-body','workspace-app-product-snapshot-unchanged'],simulated:['exact-session-event-window-not-native-save-reload','same-channel-installation-status-not-discovery'],isolation:'official-runner-owned-process-adapter'}));
