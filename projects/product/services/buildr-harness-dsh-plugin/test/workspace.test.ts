import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANNEL, linkDestination, liveCarrier, matchingCarriers, parseGuestMessage, preferredCarrier, sessionSelection, sameDirectory, toolAddress, type Session, type SessionCatalog } from '../src/workspace.ts';

const scope = { id: 'work', path: '/fixtures/repo' };
const message = (data: object) => parseGuestMessage(CHANNEL+JSON.stringify(data));
const catalog = (byId: Record<string, Session>, options: Partial<SessionCatalog> = {}): SessionCatalog => ({ phase:'ready', ids:Object.keys(byId), byId, ...options });

test('a saved association is reused only while its live session still belongs to this directory', () => {
  const bindings = new Map([['work','first'],['other','second']]);
  const sessions = catalog({ first: { cwd:'/fixtures/repo/' }, second: { cwd:'/fixtures/other' } });
  assert.equal(liveCarrier(scope, bindings, sessions, []), 'first');
  assert.equal(liveCarrier({id:'other',path:'/fixtures/other'}, bindings, sessions, []), 'second');
  assert.equal(liveCarrier({id:'work',path:'/fixtures/other'}, bindings, sessions, []), undefined);
  assert.equal(liveCarrier(scope, new Map(), sessions, []), undefined);
  assert.equal(liveCarrier(scope, bindings, catalog({}), []), undefined);
  assert.equal(liveCarrier(scope, bindings, sessions, ['first']), undefined);
  assert.equal(liveCarrier(scope, bindings, catalog(sessions.byId, {ids:['second']}), []), undefined);
  assert.equal(sameDirectory({cwd:'/fixtures/repo-suffix'}, scope), false);
});

test('auto-connect waits for the catalog and uses the only available exact directory', () => {
  const byId = {
    good: {cwd:scope.path+'/'}, parent:{cwd:'/fixtures'}, child:{cwd:scope.path+'/nested'},
    sub:{cwd:scope.path,origin:'subagent'}, old:{cwd:scope.path,formatStatus:'migration-required'},
    archived:{cwd:scope.path}, retainedOnly:{cwd:scope.path}, elsewhere:{cwd:scope.path},
  } satisfies Record<string, Session>;
  const ids = Object.keys(byId).filter(id => id !== 'retainedOnly');
  const bindings = new Map([['other','elsewhere']]);
  assert.equal(preferredCarrier(scope, bindings, catalog(byId,{ids,phase:'pending'}), ['archived']),undefined);
  assert.deepEqual(matchingCarriers(scope, bindings, catalog(byId,{ids}), ['archived']), ['good']);
  assert.equal(preferredCarrier(scope, bindings, catalog(byId,{ids}), ['archived']), 'good');
  assert.equal(preferredCarrier(null, bindings, catalog(byId,{ids}), ['archived']), undefined);
  assert.equal(preferredCarrier({id:'third',path:'/missing'}, bindings, catalog(byId,{ids}), ['archived']), undefined);
});

test('choose current or most recently active exact match, then keep it sticky across workspace changes', () => {
  const other = {id:'other',path:'/fixtures/other'};
  const sessions = catalog({a:{cwd:scope.path,updatedAt:50}, b:{cwd:scope.path,updatedAt:10}, c:{cwd:other.path,updatedAt:90}});
  const saved = new Map<string, string>();
  assert.equal(preferredCarrier(scope,saved,sessions,[]),'a');
  assert.equal(preferredCarrier(scope,saved,sessions,[],'b'),'b');
  assert.equal(preferredCarrier(scope,saved,sessions,[],'c'),'a');
  assert.deepEqual(matchingCarriers(scope,saved,sessions,[]),['a','b']);
  saved.set(scope.id,'b');
  saved.set(other.id,'c');
  assert.equal(preferredCarrier(scope,saved,sessions,[],'a'),'b');
  assert.equal(preferredCarrier(other,saved,sessions,[]),'c');
  assert.equal(preferredCarrier(scope,saved,sessions,[]),'b');
  assert.equal(preferredCarrier(scope,saved,sessions,['b']),'a');
  assert.equal(preferredCarrier(scope,saved,sessions,['a','b']),undefined);
});

test('bridge omits opaque ids, unreasonable messages and non-web/credential-bearing addresses', () => {
  assert.deepEqual(message({kind:'workspace',scope:{...scope,session:'ignored'}}), {kind:'workspace',scope});
  assert.equal(message({kind:'workspace',scope:{id:'work',path:'relative'}}), undefined);
  for (const url of ['file:///tmp/example','javascript:alert(1)','https://user@example.com','https://example.com/\n','/relative']) assert.equal(message({kind:'link',url}), undefined);
  assert.deepEqual(message({kind:'link',url:'https://platform.openai.com/settings/organization/billing/overview'}), {kind:'link',url:'https://platform.openai.com/settings/organization/billing/overview',external:false});
  assert.notEqual(toolAddress('explorer'),toolAddress('source-control'));
});

test('open native or external according to the live preference; unavailable native target is not a silent external open', () => {
  assert.equal(linkDestination('sidebar',false,true),'sidebar');
  assert.equal(linkDestination('new-tab',false,true),'external');
  assert.equal(linkDestination('sidebar',false,false),'offer');
  assert.equal(linkDestination('sidebar',true,false),'external');
});

test('file navigation carries an exact checkout and rejects paths outside its declared directory', () => {
  const file = {workspaceId:'work', revision:'observed', path:'src/entry.ts', line:4, checkout:{repositoryId:'repo',checkoutId:'checkout'}};
  assert.deepEqual(message({kind:'reveal',file}), {kind:'reveal',file});
  for (const path of ['../sibling','/tmp/file','foo/../../bar','C:/escape','foo\\bar']) assert.equal(message({kind:'reveal',file:{...file,path}}),undefined);
  assert.equal(message({kind:'reveal',file:{...file,line:0}}),undefined);
  assert.equal(message({kind:'reveal',file:{...file,checkout:{repositoryId:'repo'}}}),undefined);
});

test('desktop shell accepts only its small command set and never takes a raw session id', () => {
  for (const action of ['leave','toggle-right']) assert.deepEqual(message({kind:'shell',action}),{kind:'shell',action});
  assert.equal(message({kind:'shell',action:'schedule'}),undefined);
  assert.equal(message({kind:'bind',sessionId:'session-hidden'}),undefined);
  assert.equal(message({kind:'bind',choice:'temporary-choice'}),undefined);
  assert.equal(message({kind:'shell',action:'choose-carrier'}),undefined);
});

test('only the carrier handoff acknowledges internal navigation', () => {
  assert.equal(sessionSelection('carrier','carrier'),'align');
  assert.equal(sessionSelection('carrier','other'),'leave');
  assert.equal(sessionSelection(undefined,'carrier'),'leave');
  assert.equal(sessionSelection(undefined,undefined),'leave');
});
