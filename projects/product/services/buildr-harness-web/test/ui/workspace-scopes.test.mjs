import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalScopeKey,scopeDisplayName,workspaceScopeKey} from '../../src/workspace-scopes.ts';
test('scope names come from the authority without replacing identity',()=>{
 const scope={key:'original-key',ref:{sourceId:'buildr',id:'original-id'},authority:'registered',name:'Buildr 自举'};
 assert.equal(scopeDisplayName(scope),'Buildr 自举');
 assert.equal(scope.ref.id,'original-id');
 assert.equal(scopeDisplayName({...scope,name:undefined},'/Users/example/project'),'project');
 assert.equal(scopeDisplayName({...scope,name:undefined},'C:\\Work\\项目'),'项目');
 assert.equal(scopeDisplayName({...scope,name:undefined,authority:'offline'}),'buildr / original-id（来源离线）');
 assert.equal(scopeDisplayName({...scope,name:undefined,ref:{sourceId:'buildr',id:'@default'}}),'默认工作空间');
 assert.equal(canonicalScopeKey({sourceId:'buildr',id:'original-id'}),'original-id');
 assert.equal(canonicalScopeKey({sourceId:'harness-local',id:'dir-1'}),workspaceScopeKey({sourceId:'harness-local',id:'dir-1'}));
});
