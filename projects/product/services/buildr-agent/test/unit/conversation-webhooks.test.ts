import assert from 'node:assert/strict';
import {test} from 'node:test';
import {conversationNotifications, NOTIFICATION_TYPES, type NotificationSnapshot} from '../../src/domain/conversation-notifications.ts';
import type {ConversationView,RunView} from '../../src/contracts.ts';
const agent={name:'Buildr',id:'instance-a'};
function view(status='running'):ConversationView{return{id:'conversation',workspaceId:'workspace',cwd:'/',title:'title',revision:'1',hidden:false,updatedAt:'2026-11-03T00:00:00Z',participants:[],entries:[],requests:[],run:{id:'run',status} as RunView};}
test('all providers share seven canonical lightweight event types and required envelope',()=>{
  const chat=view();let prior:NotificationSnapshot|undefined;const sent:any[]=[];
  const publish=()=>{const result=conversationNotifications(chat,agent,'machine-a',prior);prior=result.snapshot;sent.push(...result.events);};
  publish();chat.entries=[{id:'reply',runId:'run',sequence:1,kind:'message',role:'assistant',status:'completed',text:'private full reply',createdAt:'now'}];publish();
  for(const kind of ['question','approval'] as const){chat.requests=[{id:kind,kind,title:'card',runId:'run',participantId:'p',generation:'g',conversationId:chat.id,workspaceId:chat.workspaceId}];publish();}
  chat.run!.status='completed';publish();chat.run!.status='failed';publish();
  assert.deepEqual([...new Set(sent.map(item=>item.eventType))].sort(),[...NOTIFICATION_TYPES].sort());
  for(const item of sent){for(const key of ['eventId','conversationId','agent','machine','eventType','summary','timestamp'])assert.ok(item[key]);assert.deepEqual(item.agent,agent);assert.equal(item.machine,'machine-a');}
  assert.ok(!JSON.stringify(sent).includes('private full reply'));
  assert.deepEqual(sent.map(item=>item.sequence),sent.map((_item,index)=>index+1));
  assert.equal(sent.find(item=>item.eventType==='reply').entrySequence,1);
});
test('streaming fragments and view-only revisions do not produce notifications',()=>{
  const chat=view();let prior=conversationNotifications(chat,agent,'m').snapshot;
  chat.entries=[{id:'reply',runId:'run',sequence:1,kind:'message',role:'assistant',status:'running',text:'',createdAt:'now'}];
  for(let i=0;i<200;i++){chat.entries[0].text+='x';chat.revision=String(i);const next=conversationNotifications(chat,agent,'m',prior);assert.equal(next.events.length,0);prior=next.snapshot;}
  chat.entries[0].status='completed';const done=conversationNotifications(chat,agent,'m',prior);assert.deepEqual(done.events.map(event=>event.eventType),['reply']);assert.ok(!JSON.stringify(done).includes('x'.repeat(200)));
  assert.equal(conversationNotifications(chat,agent,'m',done.snapshot).events.length,0);
});
test('questions carry IDs/options immediately and closure never means answered',()=>{
  const chat=view();const initial=conversationNotifications(chat,agent,'m');
  chat.requests=[{id:'r',kind:'question',title:'choose',runId:'run',participantId:'p',generation:'g',conversationId:chat.id,workspaceId:chat.workspaceId,questions:[{id:'q',label:'choose',options:[{id:'a',label:'A'}]}]}];
  const waiting=conversationNotifications(chat,agent,'m',initial.snapshot);
  assert.equal((waiting.events.find(event=>event.eventType==='pending_question')!.request as any).questions[0].options[0].id,'a');
  chat.requests=[];const closed=conversationNotifications(chat,agent,'m',waiting.snapshot);
  assert.deepEqual(closed.events[0].closedRequests,[{runId:'run',requestId:'r',status:'closed'}]);assert.ok(!JSON.stringify(closed.events).includes('answer'));
});
test('thinking, tool payloads and approval command titles never leave the process',()=>{
  const chat=view('completed');chat.entries=[{id:'t',sequence:1,kind:'message',role:'assistant',thinking:true,text:'hidden thought',createdAt:'now'},{id:'tool',sequence:2,kind:'tool',role:'system',text:'raw output',input:'raw command',createdAt:'now'}];
  chat.requests=[{id:'r',kind:'approval',title:'dangerous command body',runId:'run',participantId:'p',generation:'g',conversationId:chat.id,workspaceId:chat.workspaceId}];
  const sent=JSON.stringify(conversationNotifications(chat,agent,'m').events);
  for(const secret of ['hidden thought','raw output','raw command','dangerous command body'])assert.ok(!sent.includes(secret));
});
test('changed runs/tools get status metadata; duplicate state is suppressed',()=>{
  const chat=view();const first=conversationNotifications(chat,agent,'m');chat.run!.tools=[{id:'tool',label:'tool',status:'running'}];
  const next=conversationNotifications(chat,agent,'m',first.snapshot);assert.deepEqual(next.events.map(event=>event.eventType),['status_changed']);
  assert.equal(conversationNotifications(chat,agent,'m',next.snapshot).events.length,0);
});

test('late status metadata for an already announced reply never creates another reply notification',()=>{
  const chat=view('completed');chat.entries=[{id:'r',runId:'run',sequence:1,kind:'message',role:'assistant',text:'done',createdAt:'now'}];
  const first=conversationNotifications(chat,agent,'m');assert.equal(first.events.filter(event=>event.eventType==='reply').length,1);
  chat.entries[0].status='completed';chat.entries[0].text+=' final';
  const next=conversationNotifications(chat,agent,'m',first.snapshot);assert.equal(next.events.filter(event=>event.eventType==='reply').length,0);
});
