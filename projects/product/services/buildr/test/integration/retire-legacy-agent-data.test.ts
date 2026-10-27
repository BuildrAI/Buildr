import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {retireLegacyAgentData} from '../../src/modules/installation/infrastructure/retire-legacy-agent-data.ts';

test('retirement removes only fixed owned records without backup and is idempotent',t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'retire-agent-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const write=(file:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'data');};
 const profile=path.join(root,'profile'),workspace=path.join(root,'workspace');
 const removed=['agent-registrations.json','codex-desktop/connections.json','dsh-desktop/connections.json'].map(p=>path.join(profile,p));
 removed.push(...['codex','dsh'].map(p=>path.join(workspace,'.buildr/local',p+'-desktop-sessions.json')));
 const retained=[path.join(profile,'agent-service/conversations.json'),path.join(workspace,'.buildr/local/workspace.sqlite'),path.join(root,'vendor/chat.json')];
 [...removed,...retained].forEach(write);
 const result=retireLegacyAgentData(profile,[workspace]);assert.deepEqual(result.diagnostics,[]);assert.equal(result.removed.length,5);
 removed.forEach(file=>assert.equal(fs.existsSync(file),false));retained.forEach(file=>assert.equal(fs.readFileSync(file,'utf8'),'data'));
 assert.deepEqual(retireLegacyAgentData(profile,[workspace]),{removed:[],diagnostics:[]});
 assert.deepEqual(fs.readdirSync(path.join(workspace,'.buildr/local')),['workspace.sqlite']);
});

test('symlink and active-lock failures are local and never delete their targets',t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'retire-agent-link-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const outside=path.join(root,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'connections.json'),'keep');
 fs.symlinkSync(outside,path.join(root,'codex-desktop'),'dir');fs.writeFileSync(path.join(root,'agent-registrations.json'),'busy');fs.writeFileSync(path.join(root,'agent-registrations.json.lock'),'lock');
 fs.mkdirSync(path.join(root,'dsh-desktop'));fs.writeFileSync(path.join(root,'dsh-desktop/connections.json'),'remove');
 const result=retireLegacyAgentData(root,[]);assert.equal(result.diagnostics.length,2);assert.equal(result.removed.length,1);assert.equal(fs.readFileSync(path.join(outside,'connections.json'),'utf8'),'keep');
});
