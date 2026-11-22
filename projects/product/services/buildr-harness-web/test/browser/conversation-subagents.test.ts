import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const fixture = `
import {createElement as h,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {App,ConfigProvider} from 'antd';
import {softProductTheme} from '/src/theme.ts';
import {ConversationPanel} from '/src/features/agent-conversations/ConversationPanel.tsx';
import {AgentConversationsViewProvider} from '/src/features/agent-conversations/AgentConversationsContext.tsx';
import 'antd/dist/reset.css';import '/src/shared.css';import '/src/styles.css';
const now = new Date().toISOString(), workspace={id:'w',name:'Buildr',root:'/fixture'};
const base={participantId:'agent',runId:'run',provider:'claude-code',createdAt:now};
const entry=(id,sequence,kind,role,text,extra={})=>({...base,id,sequence,kind,role,text,...extra});
const initial=[
  entry('prompt',1,'message','user','核对实现是否符合方案',{status:'accepted'}),
  entry('dispatch',2,'notice','system','',{subagent:{key:'review',label:'独立审查',prompt:'核对改动与测试覆盖。',status:'running'}}),
  entry('cmd',3,'tool','system','pwd',{name:'command',status:'completed'}),
  entry('nested',4,'notice','system','子结果',{parentToolId:'review',subagent:{key:'nested',label:'检查调用方',status:'completed',returned:true}}),
  entry('child-output',5,'message','assistant','子智能体私有过程',{parentToolId:'review',status:'completed'}),
  entry('child-tool',6,'tool','system','验证输出',{name:'command',input:'printf 已验证',parentToolId:'review',status:'completed'}),
];
const no=()=>{}, asyncNo=async()=>{}, list=async()=>({conversations:[],total:0,activityCounts:{pending:0,unread:0,decisions:0,running:0},revision:'1',stats:{agents:[],models:[]}});
const api=new Proxy({list,listAll:list,activitySummary:list,entries:async()=>({id:'c',workspaceId:'w',entries:[entry('old-prompt',0,'message','user','上一轮任务',{runId:'old-run',status:'accepted'}),entry('old-agent',0.5,'notice','system','已检查打包。',{runId:'old-run',subagent:{key:'old-agent',label:'历史复核',status:'completed'}})]}),entry:async(_w,_c,e)=>e},{get(t,k){return t[k]??asyncNo;}});
const selection={workspaceId:'w',conversationId:'c',generation:1};
function Fixture(){
  const emptyOnly=new URLSearchParams(location.search).has('empty');
  const [subagentsIncluded,setSubagentsIncluded]=useState(!emptyOnly);
  const [done,setDone]=useState(false), [settled,setSettled]=useState(false), [hasEarlier,setHasEarlier]=useState(emptyOnly), [older,setOlder]=useState([]);
  window.settleTurn=()=>{setDone(true);setSettled(true);};
  window.allowEarlier=()=>setHasEarlier(true);
  window.finishChild=()=>setDone(true);
  window.revealEarlierSubagent=()=>setSubagentsIncluded(true);
  const entries=done?initial.map(row=>row.id==='dispatch'?{...row,text:'审查通过',subagent:{...row.subagent,status:'completed',returned:true}}:row).concat(entry('child-result',7,'message','assistant','审查通过',{parentToolId:'review',status:'completed'})):initial;
  const visibleEntries=subagentsIncluded?[...older,...entries,...(settled?[entry('final',8,'message','assistant','已按审查意见处理完毕。',{status:'completed'})]:[])]:[entry('plain-prompt',10,'message','user','普通长对话',{status:'accepted'}),entry('plain-reply',11,'message','assistant',Array.from({length:40},(_,i)=>'普通答复第 '+i+' 段').join('\\n\\n'),{status:'completed'})];
  const conversation={id:'c',title:'完成原任务并保持主对话草稿',cwd:'/fixture',workspaceId:'w',revision:done?'2':'1',createdAt:now,updatedAt:now,participants:[{id:'agent',connectionId:'claude-code',provider:'claude-code',label:'Claude Code',contextId:'native',deliveredThrough:1}],requests:[],entries:visibleEntries,nextEntryCursor:hasEarlier?1:undefined,run:{...base,id:'run',generation:'generation',status:settled?'completed':'running',accepted:true,tools:[],waitingSubagents:done?[]:['review'],startedAt:now,updatedAt:now,executionState:'active'}};
  const value={activityCounts:{running:1},activityStats:{agents:[],models:[]},activityRows:[],activityTotal:0,activityError:'',activityTick:1,historyWorkspaceId:null,
    openHistory:no,refreshActivity:asyncNo,loadMoreActivity:asyncNo,markSeen:asyncNo,api,reconnecting:false,recovering:false,open:true,side:'right',full:true,view:'conversation',scope:selection,draftScope:null,
    conversation,connections:[],connectionsReady:true,pending:[],modelCatalog:[],modelCatalogReady:true,modelCatalogError:'',refreshModelCatalog:asyncNo,loading:false,error:'',streamError:'',settings:false,setSettings:no,setOpen:no,setFull:no,setView:no,move:no,openGlobal:no,toggle:no,toggleView:no,openConversation:asyncNo,newConversation:no,refresh:asyncNo,refreshConnections:asyncNo,refreshPending:asyncNo,apply:no,prependEntries:page=>{setOlder(page.entries);setHasEarlier(false);},updateConnection:no,
    selectionGeneration:1,getSelection:()=>selection,isSelectionCurrent:()=>true,create:asyncNo};
  return h(AgentConversationsViewProvider,{value},h(ConversationPanel,{embedded:true,workspaces:[workspace],defaultWorkspaceId:'w'}));
}
createRoot(document.getElementById('root')).render(h(ConfigProvider,{theme:{...softProductTheme,cssVar:true,hashed:false}},h(App,null,h(Fixture))));
`;

test('subagent viewer preserves the real conversation draft and scope at desktop and narrow widths', {timeout:45000}, async t=>{
  let vite!: Awaited<ReturnType<typeof createServer>>;
  const cacheDir=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-subagents-vite-'));
  const server=http.createServer((req,res)=>{
    if(req.url!=='/'&&!req.url?.startsWith('/?'))return vite.middlewares(req,res);
    res.setHeader('content-type','text/html; charset=utf-8');
    res.end('<!doctype html><style>body{margin:0}#root{height:100dvh;width:100%}#root>.ant-app{width:100%;min-width:0}#root .ac-panel{position:relative;inset:auto;height:100%;flex:1;width:100%;max-width:none;min-width:0}</style><div id="root"></div><script type="module" src="/fixture.js"></script>');
  });
  vite=await createServer({root:new URL('../..',import.meta.url).pathname,cacheDir,configFile:false,esbuild:{jsx:'automatic'},optimizeDeps:{include:['react','react-dom/client','antd','@ant-design/icons']},server:{middlewareMode:true,hmr:{server}},appType:'custom',logLevel:'silent',plugins:[{
    name:'subagent-fixture',resolveId(id){if(id==='/fixture.js')return id;},load(id){if(id==='/fixture.js')return fixture;},
  }]});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await vite.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(cacheDir,{recursive:true,force:true});});
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const browser=await chromium.launch({headless:true});
  try {
    for(const width of [1120,430]) {
      const page=await browser.newPage({viewport:{width,height:830},reducedMotion:'reduce'});
      const errors:string[]=[];page.on('pageerror',error=>{errors.push(error.message);t.diagnostic(error.stack??error.message);});
      page.on('response',response=>{if(response.status()>=400)t.diagnostic(`${response.status()} ${response.url()}`);});
      page.setDefaultTimeout(8000);
      await page.goto(`http://127.0.0.1:${address.port}`);
      const pane=page.locator('.ac-subagent-pane'), draft=page.getByRole('textbox',{name:'子对话输入'});
      const card=page.getByRole('button',{name:/派发给.*独立审查/});
      const main=page.locator('.ac-conversation-view');
      try{await card.waitFor();}catch(error){t.diagnostic((await page.locator('body').innerText()).slice(0,2000));throw error;}
      const base=(await main.boundingBox())!;
      await draft.fill('未发送的草稿');
      assert.equal(await page.getByText('执行中 · 等待独立审查',{exact:true}).count(),1);
      assert.equal(await page.getByText('模型已结束，后台作业仍在运行',{exact:true}).count(),0);
      assert.equal(await page.getByText('子智能体私有过程',{exact:true}).count(),0);
      try{await card.click();}catch(error){t.diagnostic(JSON.stringify({width,card:await card.boundingBox(),main:await main.boundingBox()}));const evidence=process.env.BUILDR_SUBAGENT_BROWSER_EVIDENCE;if(evidence)await page.screenshot({path:`${evidence}/failed-${width}.png`});throw error;}
      const paneBox=(await pane.boundingBox())!,mainBox=(await main.boundingBox())!;
      assert.ok(width>799 ? Math.abs(paneBox.x-mainBox.x-mainBox.width)<2 : Math.abs(mainBox.width-base.width)<2);
      assert.equal(await pane.getByText('子智能体私有过程',{exact:true}).count(),1);
      assert.equal(await pane.getByText('核对改动与测试覆盖。',{exact:true}).count(),1);
      await pane.locator('details.ac-step-group > summary').click();
      await pane.locator('details.ac-step-tool > summary').click();
      await pane.getByText('验证输出',{exact:true}).waitFor();
      await pane.getByRole('button',{name:'子智能体总览',exact:true}).click();
      await pane.getByRole('heading',{name:'子智能体总览',exact:true}).waitFor();
      await pane.getByRole('button',{name:/检查调用方.*已完成/}).click();
      await pane.getByText('已回传给派发者',{exact:true}).waitFor();
      await pane.getByRole('button',{name:'回到派发',exact:true}).click();
      await pane.getByRole('heading',{name:'独立审查',exact:true}).waitFor();
      await page.waitForFunction(()=>document.activeElement?.getAttribute('data-subagent-dispatch')==='nested');
      await pane.getByRole('button',{name:'回到派发',exact:true}).click();
      await pane.waitFor({state:'hidden'});
      await page.waitForFunction(()=>document.activeElement?.getAttribute('data-subagent-dispatch')==='dispatch');
      assert.equal(await draft.inputValue(),'未发送的草稿');
      await page.getByRole('button',{name:'子智能体（2）',exact:true}).click();
      await pane.getByText('共 2 个子智能体',{exact:true}).waitFor();
      await pane.getByText('派发自 独立审查',{exact:true}).waitFor();
      await pane.getByRole('button',{name:/独立审查.*执行中/}).click();
      await page.evaluate(()=>((window as unknown as {finishChild():void}).finishChild()));
      await pane.getByText('审查通过',{exact:true}).waitFor();
      assert.equal(await page.getByText('执行中 · 等待独立审查',{exact:true}).count(),0);
      assert.equal(await pane.getByRole('radio',{name:'结果',exact:true}).count(),0);
      const stream=pane.locator('.ac-subagent-stream');
      const text=await stream.innerText();
      assert.ok(text.indexOf('子智能体私有过程')<text.indexOf('审查通过'));
      assert.equal(await pane.getByText('审查通过',{exact:true}).count(),1);
      assert.equal(await pane.getByText('已回传给派发者',{exact:true}).count(),1);
      if(width<=500)assert.ok(Math.abs(paneBox.width-base.width)<2);
      const evidence=process.env.BUILDR_SUBAGENT_BROWSER_EVIDENCE;
      if(evidence)await page.screenshot({path:`${evidence}/subagents-${width}.png`});
      await pane.getByRole('button',{name:'收起子智能体'}).click();
      assert.equal(await draft.inputValue(),'未发送的草稿');
      await page.evaluate(()=>((window as unknown as {settleTurn():void}).settleTurn()));
      const chips=page.locator('.ac-turn-subagents');
      const collapsed=page.getByRole('button',{name:'展开处理过程',exact:true});
      if(await page.getByRole('button',{name:'收起处理过程',exact:true}).count())await page.getByRole('button',{name:'收起处理过程',exact:true}).click();
      await collapsed.waitFor();
      assert.equal(await card.count(),0);
      await chips.getByRole('button',{name:'独立审查，已完成'}).click();
      await pane.getByText('审查通过',{exact:true}).waitFor();
      await pane.getByRole('button',{name:'回到派发',exact:true}).click();
      await page.waitForFunction(()=>document.activeElement?.getAttribute('data-subagent-summary')==='dispatch');
      await page.getByRole('button',{name:'子智能体（2）',exact:true}).click();
      await page.evaluate(()=>((window as unknown as {allowEarlier():void}).allowEarlier()));
      await pane.getByText('已读到2 个子智能体 · 还有更早记录',{exact:true}).waitFor();
      await pane.getByRole('button',{name:'读取更早记录',exact:true}).click();
      await pane.getByText('共 3 个子智能体',{exact:true}).waitFor();
      await pane.getByText('历史复核',{exact:true}).waitFor();
      assert.equal(await pane.getByRole('heading',{level:3}).count(),2);
      if(evidence)await page.screenshot({path:`${evidence}/overview-${width}.png`});
      assert.equal(await draft.inputValue(),'未发送的草稿');
      assert.deepEqual(errors,[]);
      await page.close();
    }
    const emptyPage=await browser.newPage({viewport:{width:1120,height:830},reducedMotion:'reduce'});
    const emptyErrors:string[]=[];emptyPage.on('pageerror',error=>emptyErrors.push(error.message));
    emptyPage.setDefaultTimeout(8000);
    await emptyPage.goto(`http://127.0.0.1:${address.port}/?empty=1`);
    await emptyPage.getByText('普通答复第 0 段',{exact:true}).waitFor();
    assert.equal(await emptyPage.locator('.ac-subagent-entry').count(),0,'无子智能体时不显示顶栏子智能体入口');
    await emptyPage.evaluate(()=>((window as unknown as {revealEarlierSubagent():void}).revealEarlierSubagent()));
    await emptyPage.getByRole('button',{name:'子智能体（2）',exact:true}).waitFor();
    await emptyPage.getByRole('button',{name:'子智能体（2）',exact:true}).click();
    await emptyPage.locator('.ac-subagent-pane').getByRole('heading',{name:'子智能体总览',exact:true}).waitFor();
    assert.deepEqual(emptyErrors,[]);
    await emptyPage.close();
  } finally {await browser.close();}
});
