import assert from 'node:assert/strict';
import test from 'node:test';
import {agentProgramView} from '../src/features/agent-conversations/agent-program-view.ts';
import {conversationMetadata} from '../src/features/agent-conversations/conversation-activity.ts';
import {catalogConversationOption} from '../src/features/agent-conversations/conversation-options.ts';

const program={connectionId:'qoder-cn',provider:'qoder-cn',executable:'/private/qodercn',managed:true,status:'latest',currentVersion:'1.1.86',currentReleaseVersion:'1.1.86',latestVersion:'1.1.86'};
test('program readiness is independent of native model login for every agent',()=>{
  for(const provider of ['codex','dsh','qoder','qoder-cn'])for(const status of ['ready','not-authenticated','expired','failed']){
    const view=agentProgramView({...program,provider},{enabled:true,configPath:'/private/config',status});
    assert.equal(view.prepared,true);
    assert.equal(view.version,'1.1.86');
  }
  assert.equal(agentProgramView(program,{enabled:false,configPath:'/private/config'}).prepared,false);
  assert.equal(agentProgramView(program,{enabled:true}).prepared,false);
});
test('completed upgrades do not replace current release facts or invent a known latest version',()=>{
  const upgrade={state:'completed',installedExecutable:program.executable,expectedVersion:'1.1.86',currentVersion:'1.1.86'};
  assert.equal(agentProgramView({...program,upgrade}).updateLabel,'已是最新');
  assert.equal(agentProgramView({...program,status:'unchecked',latestVersion:undefined,upgrade}).updateLabel,'已更新');
  const newer=agentProgramView({...program,status:'available',latestVersion:'1.1.87',upgrade});
  assert.equal(newer.completed,false);
  assert.equal(newer.updateLabel,'有新版本');
  assert.equal(newer.canUpdate,true);
});
test('active upgrades and failures remain explicit without hiding the installed version',()=>{
  for(const [state,label] of [['downloading','正在下载'],['waiting','等待工作结束'],['restarting','正在重启']]){
    const view=agentProgramView({...program,upgrade:{state}});
    assert.equal(view.pending,true);assert.equal(view.updateLabel,label);assert.equal(view.version,'1.1.86');
  }
  assert.equal(agentProgramView({...program,upgrade:{state:'failed'}}).updateLabel,'更新未完成');
});
test('conversation list uses shared product names, including Qoder CN',()=>{
  for(const [provider,label] of [['codex','Codex'],['dsh','DSH'],['qoder','Qoder'],['qoder-cn','Qoder CN']]){
    assert.equal(conversationMetadata({run:{provider}},'Buildr','Model'),`Buildr · ${label} · Model`);
  }
});
test('Qoder models from other products are disabled without renaming or explanatory suffixes',()=>{
  for(const agent of ['qoder','qoder-cn'])for(const provider of ['native-qoder','native-qoder-cn','native-codex','devin']){
    const item={accountId:provider,provider,modelId:'model',label:'Model',available:true};
    const option=catalogConversationOption(agent,item);
    assert.equal(option.disabled,provider!=='native-'+agent);
    assert.equal(option.label,'Model');
    assert.equal(option.value,`shared:${provider}::model`);
  }
  assert.equal(catalogConversationOption('codex',{accountId:'qoder',provider:'native-qoder',modelId:'model',label:'Model',available:true}).disabled,false);
  assert.deepEqual(catalogConversationOption('qoder-cn',{accountId:'cn',provider:'native-qoder-cn',modelId:'model',label:'Model',available:false,creditFactor:1}),{value:'shared:cn::model',label:'Model · 1.00x',disabled:true});
});
