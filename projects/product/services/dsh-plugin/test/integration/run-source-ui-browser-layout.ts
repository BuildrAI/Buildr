/** Browser layout regression only: actual final compiled Client plugin and real SDK assembly. */
import path from 'node:path';import fs from 'node:fs/promises';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'build/source-ui-browser'),require=createRequire(path.join(root,'../buildr/package.json')),{chromium}=require('playwright-core');
const binary=process.env.BUILDR_DSH_SOURCE_UI_CHROMIUM;
if(binary===undefined||!path.isAbsolute(binary))throw Error('BUILDR_DSH_SOURCE_UI_CHROMIUM must name an already prepared absolute Chromium executable.');
await fs.access(binary,fs.constants.X_OK);
const browser=await chromium.launch({headless:true,executablePath:binary});
try{
 const context=await browser.newContext({locale:'zh-CN',viewport:{width:1440,height:1000}});await context.route(/^https?:/,route=>route.abort());const page=await context.newPage(),errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.stack??error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 const countRequests=()=>page.evaluate(()=>window.sourceFixture.requests.length);
 const settlePaint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const sourceView=()=>page.getByRole('searchbox',{name:'搜索 Buildr 对象'}).locator('xpath=ancestor::main[1]');
 const details=()=>sourceView().getByRole('region',{name:'参与详情',exact:true});
 const shownIds=()=>page.locator('[data-buildr-record-selector]').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-buildr-record-selector')??element.getAttribute('data-buildr-record-selector')));
 const assertOriginalOrder=async()=>{const shown=await shownIds(),original=await page.evaluate(()=>window.sourceFixture.records.map(record=>record.recordId));assert.deepEqual(shown,original.filter(id=>shown.includes(id)),'Filtering and settled sources retain original producer order');return shown;};
 const checkClosedGeometry=async(label:string)=>{
  assert.equal(await details().count(),0,label+': the detail region is unmounted');assert.equal(await page.locator('[data-content-view]').count(),0);
  assert.equal(await sourceView().getAttribute('data-details-open'),'false');
  const list=page.locator('[data-buildr-record-selector]').first().locator('xpath=parent::*');
  const measured=await list.evaluate(element=>{const view=element.closest('main');if(view===null)throw Error('Missing source viewport');const style=getComputedStyle(view),list=element.getBoundingClientRect();return {listWidth:list.width,listLeft:list.left,listRight:list.right,availableWidth:view.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),scrollTop:element.scrollTop};});
  assert.ok(measured.listWidth>=measured.availableWidth-2,label+': the closed list fills its actual host container: '+JSON.stringify(measured));return measured;
 };
 const checkCloseCycle=async(label:'wide'|'narrow'|'container-narrow')=>{
  const ids=await assertOriginalOrder(),requests=await countRequests();await details().waitFor();
  const list=page.locator('[data-buildr-record-selector]').first().locator('xpath=parent::*'),handle=await list.elementHandle();assert.ok(handle);
  const beforeWidth=(await list.boundingBox())?.width;assert.ok(beforeWidth);const scrollTop=await list.evaluate(element=>element.scrollTop);
  await details().getByRole('button',{name:'关闭详情',exact:true}).click();await settlePaint();const closed=await checkClosedGeometry(label);
  assert.equal(await list.evaluate((element,previous)=>element===previous,handle),true,label+': retain the same list owner');assert.equal(await list.evaluate(element=>element.scrollTop),scrollTop,label+': retain list scrolling');assert.deepEqual(await assertOriginalOrder(),ids);assert.equal(await countRequests(),requests);
  if(label==='wide')assert.ok(closed.listWidth>beforeWidth+200,'Closing wide details physically restores the second-column space');
  await page.screenshot({path:path.join(out,`layout-${label}-closed-list.png`),fullPage:true});
  const id=await page.evaluate(()=>window.sourceFixture.records.find(record=>record.callId==='fixture-read-call')?.recordId);assert.equal(typeof id,'string');await page.locator(`[data-buildr-record-selector=${JSON.stringify(id)}]`).click();await page.locator('[data-content-view="observed"]').waitFor();assert.equal(await countRequests(),requests,label+': reopening is a local cache action');
  return {beforeWidth,closed,listPreserved:true,sourceReadsUnchanged:true};
 };
 // Measure what readers can see, rather than the renderer's number of spans or grid rows.
 // Two readable lines plus restrained padding should fit a useful loaded-method window.
 const checkListDensity=async(label:'wide'|'narrow'|'container-narrow')=>{
  const view=page.getByRole('searchbox',{name:'搜索 Buildr 对象'}).locator('xpath=ancestor::main[1]');
  const first=page.locator('[data-buildr-record-selector]').first();
  await view.evaluate(element=>{element.scrollTop=0;});
  const list=first.locator('xpath=parent::*');await list.evaluate(element=>{element.scrollTop=0;});await settlePaint();
  const measured=await list.evaluate(element=>{
   const rect=(target:Element|Range)=>{const box=target.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height};};
   const listBox=rect(element),view=element.closest('main');if(view===null)throw Error('Loaded-method list has no bounded view');
   const viewBox=rect(view),visibleTop=Math.max(listBox.top,viewBox.top),visibleBottom=Math.min(listBox.bottom,viewBox.bottom);
   const selector='[data-buildr-record-selector]';
   const rows=[...element.querySelectorAll<HTMLButtonElement>(selector)].map(button=>{
    const box=rect(button),primary=button.querySelector('strong');if(primary===null)throw Error('Method row lost its main object');
    const textRects:{text:string;top:number;bottom:number;left:number;right:number}[]=[],walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);
    let node:Node|null;while((node=walker.nextNode())!==null){if(!(node.textContent??'').trim())continue;const range=document.createRange();range.selectNodeContents(node);for(const box of range.getClientRects())if(box.width>0&&box.height>0)textRects.push({text:node.textContent??'',top:box.top,bottom:box.bottom,left:box.left,right:box.right});}
    const lineTops:number[]=[];for(const box of textRects.sort((a,b)=>a.top-b.top))if(!lineTops.some(top=>Math.abs(top-box.top)<=3))lineTops.push(box.top);
    const primaryNode=primary.firstChild,range=document.createRange();if(primaryNode===null||primaryNode.nodeType!==Node.TEXT_NODE)throw Error('Method main object is not rendered as text');
    range.setStart(primaryNode,0);range.setEnd(primaryNode,Math.min(3,(primaryNode.textContent??'').length));
    const next=button.nextElementSibling;
    return {box,primary:(primary.textContent??'').trim(),primaryBox:rect(primary),primaryPrefix:rect(range),primaryFontSize:parseFloat(getComputedStyle(primary).fontSize),title:button.title,aria:button.getAttribute('aria-label'),text:button.textContent??'',lineTops,textRects,clientWidth:button.clientWidth,scrollWidth:button.scrollWidth,adjacentStep:next?.matches(selector)?next.getBoundingClientRect().top-box.top:null,fullyVisible:box.top>=visibleTop-1&&box.bottom<=visibleBottom+1};
   });
   return {list:listBox,clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,visibleTop,visibleBottom,fullyVisibleRows:rows.filter(row=>row.fullyVisible).length,rows};
  });
  assert.ok(measured.rows.length>=24,label+': the density sample contains a real loaded method window');
  assert.ok(measured.scrollWidth<=measured.clientWidth+1,label+': the list has no horizontal scroll escape: '+JSON.stringify(measured));
  for(const row of measured.rows){const info=label+': '+JSON.stringify(row);
   assert.ok(row.lineTops.length<=2,'Each method row uses at most two rendered text lines: '+info);
   assert.ok(Math.abs(row.box.height-52)<=1,'Two-line method rows keep the 52 px virtual-list unit: '+info);
   assert.ok(row.adjacentStep===null||Math.abs(row.adjacentStep-52)<=1,'Consecutive methods use the same 52 px scroll unit: '+info);
   assert.ok(row.scrollWidth<=row.clientWidth+1,'The method row cannot overflow its list horizontally: '+info);
   assert.ok(row.primaryFontSize>=12,'Density keeps the main object readable instead of shrinking below 12 px: '+info);
   assert.ok(row.primaryPrefix.width>0&&row.primaryPrefix.left>=row.box.left-1&&row.primaryPrefix.right<=row.box.right+1,'A readable main-object prefix remains visible: '+info);
   assert.ok(row.title.includes(row.primary),'Hover retains the complete untruncated object name: '+info);
   assert.equal(row.aria,row.title,'The same complete method meaning is available to assistive technology: '+info);
   assert.equal(await page.getByRole('button',{name:row.title,exact:true}).count(),1,'The complete label identifies one actionable method: '+info);
  }
  const oldTallRowCapacity=Math.floor((measured.visibleBottom-measured.visibleTop)/120);
  assert.ok(measured.fullyVisibleRows>oldTallRowCapacity,label+': more loaded methods fit than the original 120 px tall-row capacity: '+JSON.stringify(measured));
  // Recorded method actions and failed calls retain distinct, fully visible facts.
  // These checks guard meaning that a simple height assertion could hide behind ellipsis.
  for(const expected of [{callId:'fixture-read-call',tokens:['已读取'],full:['Buildr 核心规则','读取','已记录来源','已读取']},{callId:'fixture-skill-call',tokens:['已装载'],full:['task-review','装载技能','已记录来源','已装载']},{callId:'fixture-failed-capability-call',tokens:['执行失败'],full:['task inspect','查看任务','执行失败','退出码 1']}]){
   const id=await page.evaluate(callId=>window.sourceFixture.records.find(record=>record.callId===callId)?.recordId,expected.callId);assert.equal(typeof id,'string');
   const row=page.locator(`[data-buildr-record-selector=${JSON.stringify(id)}], [data-buildr-record-selector=${JSON.stringify(id)}]`);await row.scrollIntoViewIfNeeded();await settlePaint();
   const status=await row.evaluate((button,tokens)=>{
    const rowBox=button.getBoundingClientRect(),status=button.querySelector('strong')?.nextElementSibling;if(status===null||status===undefined)throw Error('Missing primary status area');const walker=document.createTreeWalker(status,NodeFilter.SHOW_TEXT),results=[];let node:Node|null;
    while((node=walker.nextNode())!==null){for(const token of tokens){const offset=(node.textContent??'').indexOf(token);if(offset<0)continue;const range=document.createRange();range.setStart(node,offset);range.setEnd(node,offset+token.length);const box=range.getBoundingClientRect();let visible={left:rowBox.left,right:rowBox.right,top:rowBox.top,bottom:rowBox.bottom};for(let parent=node.parentElement;parent!==null;parent=parent.parentElement){const style=getComputedStyle(parent),clip=parent.getBoundingClientRect();if(['auto','scroll','hidden','clip'].includes(style.overflowX)){visible.left=Math.max(visible.left,clip.left);visible.right=Math.min(visible.right,clip.right);}if(['auto','scroll','hidden','clip'].includes(style.overflowY)){visible.top=Math.max(visible.top,clip.top);visible.bottom=Math.min(visible.bottom,clip.bottom);}}const hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);results.push({token,width:box.width,left:box.left,right:box.right,top:box.top,bottom:box.bottom,visible,hit:hit!==null&&button.contains(hit)});}}
    return results;
   },expected.tokens);
   assert.equal(status.length,expected.tokens.length,label+': the row retains its captured execution outcome');
   for(const value of status)assert.ok(value.width>0&&value.left>=value.visible.left-1&&value.right<=value.visible.right+1&&value.top>=value.visible.top-1&&value.bottom<=value.visible.bottom+1&&value.hit,label+': state stays readable through all clips: '+JSON.stringify(value));
   const title=await row.getAttribute('title');for(const token of expected.full)assert.ok(title?.includes(token),label+': compact row retains full action, provenance and result in hover: '+title);
  }
  await view.evaluate(element=>{element.scrollTop=0;});await list.evaluate(element=>{element.scrollTop=0;});await settlePaint();
  await page.screenshot({path:path.join(out,`layout-${label}-compact-list.png`),fullPage:true});return measured;
 };
 const checkComposerAndLastLine=async(label:'wide'|'narrow'|'container-narrow')=>{
  const view=page.getByRole('searchbox',{name:'搜索 Buildr 对象'}).locator('xpath=ancestor::main[1]');
  const body=page.locator('[data-content-view="observed"]');await body.waitFor();
  const detail=body.locator('xpath=ancestor::article[1]/parent::*');
  const before=await view.evaluate(element=>{const composer=document.querySelector('[data-fixture-composer]'),host=document.querySelector('.fixture-body');if(composer===null||host===null)throw Error('Missing controlled host geometry');const box=(node:Element)=>{const value=node.getBoundingClientRect();return {x:value.x,y:value.y,top:value.top,bottom:value.bottom,left:value.left,right:value.right,width:value.width,height:value.height};};return {view:box(element),host:box(host),composer:box(composer),overflow:getComputedStyle(element).overflowY,documentHeight:document.documentElement.scrollHeight,viewportHeight:innerHeight};});
  assert.ok(Math.abs(before.composer.height-170)<=1,label+': the host actually overlays a 170 px composer');
  assert.ok(before.view.top>=before.host.top-1&&before.view.bottom<=before.composer.top+1,label+': SourceView physically ends above the composer');
  assert.ok(before.view.left>=before.host.left-1&&before.view.right<=before.host.right+1,label+': SourceView fits the available conversation container, independent of window width');
  assert.ok(before.view.height<=before.host.height-before.composer.height+1,label+': production reserves composer space from the full host viewport');
  assert.equal(before.overflow,'hidden',label+': the view reserves space while its list and detail own scrolling');
  assert.ok(before.documentHeight<=before.viewportHeight+1,label+': content cannot escape by growing the whole document behind the composer');
  // Both displays use the same saved fragment. Only the detail scrolls vertically;
  // do not inject styles or manually move a second body scroll pane.
  const displays=[];
  for(const mode of ['markdown','raw'] as const){
   await details().getByRole('button',{name:mode==='raw'?'原文':'预览',exact:true}).click();
   assert.equal(await body.getAttribute('data-content-format'),mode);
   const detailScroll=await detail.evaluate(element=>{const before=element.scrollTop;const overflow=getComputedStyle(element).overflowY;element.scrollTop=element.scrollHeight;return {overflow,before,after:element.scrollTop,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight};});
   assert.ok(['auto','scroll'].includes(detailScroll.overflow)&&detailScroll.scrollHeight>detailScroll.clientHeight+1&&detailScroll.after>0,label+': the long method uses the detail scroll pane');
   const bodyScroll=await body.evaluate(element=>{const overflow=getComputedStyle(element).overflowY;return {overflow,scrollTop:element.scrollTop,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight};});
   assert.ok(!['auto','scroll'].includes(bodyScroll.overflow)&&bodyScroll.scrollTop===0,label+': the '+mode+' body does not nest a vertical scroll pane');
   await settlePaint();
   const geometry=await body.evaluate(element=>{
   const marker='SYNTHETIC_BUILDR_METHOD_END',walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node:Node|null=null,offset=-1;
   while((node=walker.nextNode())!==null){offset=(node.textContent??'').lastIndexOf(marker);if(offset>=0)break;}
   if(node===null||offset<0)throw Error('Long synthetic method sentinel is absent from the actual rendered body');
   const object=element.closest('article'),detail=object?.parentElement,view=element.closest('main'),composer=document.querySelector('[data-fixture-composer]');
   if(!object||!detail||!view||!composer)throw Error('Missing production detail or controlled composer');
   const box=(target:Element|Range)=>{const value=target.getBoundingClientRect();return {x:value.x,y:value.y,top:value.top,bottom:value.bottom,left:value.left,right:value.right,width:value.width,height:value.height};};
   const range=document.createRange();range.setStart(node,offset);range.setEnd(node,offset+marker.length);
   const bodyBox=box(element),detailBox=box(detail),viewBox=box(view),composerBox=box(composer),lastLine=box(range);
   const visible={top:Math.max(bodyBox.top,detailBox.top,viewBox.top),bottom:Math.min(bodyBox.bottom,detailBox.bottom,viewBox.bottom,composerBox.top),left:Math.max(bodyBox.left,detailBox.left,viewBox.left),right:Math.min(bodyBox.right,detailBox.right,viewBox.right)};
   const hit=document.elementFromPoint(lastLine.left+lastLine.width/2,lastLine.top+lastLine.height/2);
   return {view:viewBox,detail:detailBox,body:bodyBox,composer:composerBox,lastLine,visible,lastLineHitBody:hit!==null&&element.contains(hit)};
  });
  assert.ok(geometry.view.bottom<=geometry.composer.top+1,label+': SourceView stays above the composer after scrolling');
  assert.ok(geometry.detail.bottom<=geometry.composer.top+1,label+': the exposed detail physically ends above the composer');
  assert.ok(geometry.detail.left>=geometry.view.left-1&&geometry.detail.right<=geometry.view.right+1,label+': the detail fits the actual view width rather than escaping a narrow host container');
  assert.ok(geometry.lastLine.width>0&&geometry.lastLine.height>0,label+': final method line has real rendered geometry');
  assert.ok(geometry.lastLine.top>=geometry.visible.top-1&&geometry.lastLine.bottom<=geometry.visible.bottom+1,label+': the '+mode+' last line is visible above the composer');
  assert.ok(geometry.lastLine.left>=geometry.visible.left-1&&geometry.lastLine.right<=geometry.visible.right+1,label+': the last line has no horizontal overflow');
  assert.equal(geometry.lastLineHitBody,true,label+': the composer or another overlay does not cover the final line');
   displays.push({mode,detailScroll,bodyScroll,...geometry});
  }
  await details().getByRole('button',{name:'预览',exact:true}).click();
  return {before,displays,...displays[0]!};
 };
 await page.goto(pathToFileURL(path.join(out,'index.html')).href);await page.waitForFunction(()=>document.documentElement.dataset.fixtureReady==='true'||document.documentElement.dataset.fixtureError);assert.equal(await page.locator('html').getAttribute('data-fixture-error'),null);
 const table=page.locator('table');await table.waitFor();assert.equal(await countRequests(),0);
 const search=page.getByRole('searchbox',{name:'搜索轨迹'});await search.fill('Loaded window record 80');await search.press('Enter');await page.getByRole('row',{name:/Loaded window record 80/}).waitFor();assert.equal(await page.getByRole('row',{name:/Original preserved user input/}).count(),0);assert.equal(await page.getByRole('row',{name:/Loaded window record 79/}).count(),0);assert.equal(await page.locator('tr[data-record-index]').count(),1);await search.fill('');await search.press('Enter');await page.waitForFunction(()=>document.querySelectorAll('tr[data-record-index]').length>1);
 const expandedRows=await page.locator('tr[data-record-index]').count();await page.getByRole('button',{name:'收起所有轮次',exact:true}).click();const expand=page.getByRole('button',{name:'展开所有轮次',exact:true});await expand.waitFor();assert.equal(await expand.getAttribute('aria-pressed'),'true');const collapsedRows=await page.locator('tr[data-record-index]').count();assert.ok(collapsedRows<expandedRows);await expand.click();await page.waitForFunction(previous=>document.querySelectorAll('tr[data-record-index]').length>previous,collapsedRows);assert.equal(await page.getByRole('button',{name:'收起所有轮次',exact:true}).getAttribute('aria-pressed'),'false');assert.equal(await countRequests(),0,'Original navigation cannot issue source reads');
 await search.fill('AGENTS.md');await search.press('Enter');await page.getByRole('row',{name:/read_file/}).first().click();const timing=page.getByRole('tab',{name:'计时',exact:true});await timing.click();assert.equal(await timing.getAttribute('aria-selected'),'true');await page.getByText(/^200\s*毫秒$/).waitFor();await page.getByText('会话时间戳',{exact:true}).waitFor();await page.getByRole('button',{name:'关闭详情',exact:true}).click();await search.fill('');await search.press('Enter');
 const beforeSource=await countRequests();await page.getByRole('button',{name:'Buildr 来源入口',exact:true}).click();await page.locator('[data-buildr-record-selector]').first().waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await countRequests(),beforeSource);
 assert.equal(await page.locator('[data-buildr-record-selector]').filter({hasText:'user-notes.md'}).count(),0);
 const initialClosed=await checkClosedGeometry('initial');await assertOriginalOrder();
 const recordId=await page.evaluate(()=>window.sourceFixture.records.find(record=>record.callId==='fixture-read-call')?.recordId);assert.equal(typeof recordId,'string');const selector=JSON.stringify(recordId);await page.locator(`[data-buildr-record-selector=${selector}], [data-buildr-record-selector=${selector}]`).click();
 const object=page.locator('[data-buildr-object-id]');await object.waitFor();assert.equal(await page.locator('[data-buildr-object-selector]').count(),0);
 const beforeSettledOrder=await assertOriginalOrder();
 await object.getByRole('heading',{name:'Recorded Buildr rule',exact:true}).waitFor();await page.locator('[data-buildr-record-selector]').first().getByText('已读取',{exact:true}).waitFor();
 const failedId=await page.evaluate(()=>window.sourceFixture.records.find(record=>record.callId==='fixture-failed-capability-call')?.recordId);assert.equal(typeof failedId,'string');
 await page.locator(`[data-buildr-record-selector=${JSON.stringify(failedId)}]`).click();await page.locator(`[data-buildr-record-selector=${JSON.stringify(failedId)}]`).waitFor();await details().getByText('查看任务 Failed fixture task',{exact:true}).waitFor();await settlePaint();assert.deepEqual(await assertOriginalOrder(),beforeSettledOrder,'Settled failure does not move the original record to another group');
 assert.equal(await page.locator('[data-content-view]').count(),0,'The controlled failed capability carries references and result, not document bodies');
 await page.locator(`[data-buildr-record-selector=${selector}]`).click();await page.locator('[data-content-view="observed"]').waitFor();
 assert.equal(await page.getByRole('button',{name:'当前内容',exact:true}).count(),0);const body=page.locator('[data-content-view="observed"]');await body.waitFor();const selectedRequests=await countRequests();
 const sourceSearch=page.getByRole('searchbox',{name:'搜索 Buildr 对象'}),filterRequests=await countRequests();await sourceSearch.fill('技能读取');assert.ok((await assertOriginalOrder()).length>=24,'Action names are searchable in the displayed language');assert.equal(await countRequests(),filterRequests);
 await sourceSearch.fill('task-review');assert.equal((await shownIds()).length,1);await details().getByRole('button',{name:'关闭详情',exact:true}).click();await settlePaint();await checkClosedGeometry('filtered-close');
 const filteredFocus=await sourceView().evaluate(view=>{const focused=document.activeElement;if(!(focused instanceof HTMLElement)||!view.contains(focused))return {valid:false,visible:false};const box=focused.getBoundingClientRect(),hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);return {valid:focused.matches('input[type="search"], [data-buildr-record-selector]'),visible:box.width>0&&box.height>0&&hit!==null&&focused.contains(hit)};});assert.ok(filteredFocus.valid&&filteredFocus.visible,'Closing a filtered-out current row retains focus on a visible action or search');assert.equal(await countRequests(),filterRequests);
 await sourceSearch.fill('');await page.locator(`[data-buildr-record-selector=${selector}]`).click();await page.locator('[data-content-view="observed"]').waitFor();assert.equal(await countRequests(),filterRequests);await assertOriginalOrder();
 const wideClose=await checkCloseCycle('wide');const wideDensity=await checkListDensity('wide');
 const wideGeometry=await checkComposerAndLastLine('wide'),wideBox=wideGeometry.detail,wideBodyBox=wideGeometry.body;
 const listBox=await page.locator('[data-buildr-record-selector]').first().evaluate(element=>{const parent=element.parentElement;if(parent===null)throw Error('Missing marked record list');const box=parent.getBoundingClientRect();return {top:box.top,bottom:box.bottom,height:box.height,scrollHeight:parent.scrollHeight,clientHeight:parent.clientHeight,overflow:getComputedStyle(parent).overflowY};});
 assert.ok(listBox.height<=wideGeometry.view.height&&listBox.bottom<=wideGeometry.composer.top+1,'The wide record list is physically bounded above the host composer');assert.ok(listBox.scrollHeight>listBox.clientHeight,'The loaded method list really requires scrolling');assert.ok(['auto','scroll'].includes(listBox.overflow));
 await page.screenshot({path:path.join(out,'layout-wide-positive-content.png'),fullPage:true});await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));await page.screenshot({path:path.join(out,'layout-wide-dark-positive-content.png'),fullPage:true});await page.evaluate(()=>document.body.removeAttribute('data-ds-dark-theme'));
 await page.setViewportSize({width:420,height:900});await settlePaint();const narrowClose=await checkCloseCycle('narrow'),narrowDensity=await checkListDensity('narrow');const narrowGeometry=await checkComposerAndLastLine('narrow'),narrowBox=narrowGeometry.body;await page.screenshot({path:path.join(out,'layout-narrow-positive-content.png'),fullPage:true});assert.deepEqual(errors,[]);
 // A real side panel can squeeze the conversation while the window stays wide.
 // Only the fixture's host container is resized; production layout/CSS is untouched.
 await page.setViewportSize({width:1440,height:1000});await page.locator('.fixture-body').evaluate((element:HTMLElement)=>{element.style.width='420px';element.style.right='auto';});await settlePaint();
 const containerNarrowClose=await checkCloseCycle('container-narrow'),containerNarrowDensity=await checkListDensity('container-narrow'),containerNarrowGeometry=await checkComposerAndLastLine('container-narrow');await page.screenshot({path:path.join(out,'layout-container-narrow-positive-content.png'),fullPage:true});
 assert.equal(await countRequests(),selectedRequests,'Scrolling long method content does not trigger more source reads');
 const inputs=JSON.parse(await fs.readFile(path.join(out,'inputs.json'),'utf8')),result={schemaVersion:'buildr.dsh-recorded-source-browser-layout-result/v1',status:'passed',inputs,runtime:{node:process.execPath,chromium:binary},tier:'real Chromium against offline final compiled Client artifacts',notDesktop:true,controlledRPC:true,scope:'Compact Buildr method list, synthetic method scrolling above a controlled host composer, and preserved original search/fold/timing',hostComposerHeight:170,methodBody:'synthetic Buildr-owned instructions; no user document',search:{included:'Loaded window record 80',excluded:['original user input','record 79'],renderedMatchingRows:1},fold:{expandedRows,collapsedRows,restored:true},timing:{selected:true,durationMilliseconds:200,source:'会话时间戳'},detailInteraction:{initialClosed,wideClose,narrowClose,containerNarrowClose,filteredFocus,originalOrderRetained:true,localizedActionSearchLocal:true},source:{zeroMarkerRPCOnEntry:true,zeroHostReadsOnEntry:true,localRecordedMarks:true,selectedOriginalContentOnly:true,ordinaryUserReadExcluded:true,singleObjectPickerHidden:true,defaultRecordedBodyExpanded:true,controlledFailedCapability:true,lastLineReachableAboveComposer:true,markdownAndRawBothReachable:true,singleDetailVerticalScroll:true},density:{maxRenderedLines:2,rowHeight:52,maxRowHeight:53,maxAdjacentStep:53,minMainFontSize:12,fullHoverAndAccessibleNames:true,recordedSourceAndFailedStatesVisible:true,wide:wideDensity,narrow:narrowDensity,containerNarrow:containerNarrowDensity},wideBox,wideBodyBox,listBox,narrowBox,wideGeometry,narrowGeometry,containerNarrowGeometry,consoleErrors:errors};await fs.writeFile(path.join(out,'browser-layout-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));await context.close();
}finally{await browser.close();}
