import test from 'node:test';
import assert from 'node:assert/strict';
import {ModelLoginPages} from '../src/features/agent-conversations/model-login-pages.ts';
const account=(state,url,id='attempt')=>({id:'native-qoder-cn',loginAttempt:{id,state,url}});
const popup=()=>({closed:false,close(){this.closed=true;},location:{href:'about:blank'},opener:{},document:{title:'',body:{textContent:''}}});
test('click reserves one page synchronously; asynchronous URL navigates it exactly once',()=>{
 const tab=popup();let opens=0;const pages=new ModelLoginPages(()=>{opens++;return tab;});
 const reservation=pages.reserve('native-qoder-cn');assert.equal(opens,1);assert.equal(tab.opener,null);
 pages.observe([account('failed')]);assert.equal(tab.closed,false,'old failure must not close a new reservation');
 reservation.bind('attempt');pages.observe([account('initializing')]);assert.equal(tab.closed,false);
 pages.observe([account('waiting-browser','https://qoder.cn/device/selectAccounts?challenge=test')]);
 assert.match(tab.location.href,/qoder.cn/);pages.observe([account('waiting-browser',tab.location.href)]);
 pages.observe([account('completed')]);pages.close();assert.equal(opens,1);assert.equal(tab.closed,false,'keep the official page after redirect');
});
test('failed or cancelled preparation closes only its unused blank page',()=>{
 for(const state of ['failed','cancelled','expired']){const tab=popup();const pages=new ModelLoginPages(()=>tab);pages.reserve('native-qoder-cn').bind('attempt');pages.observe([account(state)]);assert.equal(tab.closed,true);}
});
test('blocked popups retain the manual URL and do not repeatedly try opening',()=>{
 let opens=0;const pages=new ModelLoginPages(()=>{opens++;return null;});pages.reserve('native-qoder-cn').bind('attempt');
 const row=account('waiting-browser','https://qoder.cn/device/selectAccounts');pages.observe([row]);pages.observe([row]);assert.equal(opens,2);assert.ok(row.loginAttempt.url);
});
