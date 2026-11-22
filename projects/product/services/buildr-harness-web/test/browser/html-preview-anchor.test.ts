import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';
import {conversationFileLink,htmlFileLink,htmlPreviewAddress} from '../../src/lib/localFileLink.ts';

test('only HTML link fragments are separated from the source path', () => {
  assert.deepEqual(htmlFileLink('/tmp/report.html#skills',false),{path:'/tmp/report.html',fragment:'#skills'});
  assert.deepEqual(htmlFileLink('audit/report.HTM#missing',false),{path:'audit/report.HTM',fragment:'#missing'});
  assert.deepEqual(htmlFileLink('file:///tmp/a%23b.htm#%E6%8A%80%E8%83%BD',false),{path:'/tmp/a#b.htm',fragment:'#%E6%8A%80%E8%83%BD'});
  assert.deepEqual(htmlFileLink('file:///tmp/report.html%23skills',false),{path:'/tmp/report.html#skills'});
  for(const reference of ['src/main.ts#L42','src/main.ts:42','/tmp/report.html','/tmp/a#b.html']){
    assert.deepEqual(htmlFileLink(reference,false),{path:reference});
  }
  assert.deepEqual(htmlFileLink('/tmp/report.html#skills',true),{path:'/tmp/report.html#skills'});
  assert.equal(htmlPreviewAddress('/preview?path=a%23b#old','#skills'),'/preview?path=a%23b#skills');
  assert.equal(htmlPreviewAddress(undefined,'#skills'),undefined);
});

test('conversation links split line locations without reinterpreting encoded or literal filenames', () => {
  assert.deepEqual(conversationFileLink('/a/AGENTS.project.md#L7',false),{path:'/a/AGENTS.project.md',line:7});
  assert.deepEqual(conversationFileLink('file:///a/a%23b.md#L7',false),{path:'/a/a#b.md',line:7});
  assert.deepEqual(conversationFileLink('file:///a/a.md%23L7',false),{path:'/a/a.md#L7'});
  assert.deepEqual(conversationFileLink('/a/a.md#L7',true),{path:'/a/a.md#L7'});
  assert.deepEqual(conversationFileLink('/a/a.md:7',false),{path:'/a/a.md',line:7});
  assert.deepEqual(conversationFileLink('/a/report.html#L7',false),{path:'/a/report.html',fragment:'#L7'});
});

test('HTML preview jumps in the sandbox and in a new tab; a missing anchor still opens the document', {timeout:45000}, async t => {
  const fixture = `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {MarkdownHost} from '/src/components/MarkdownHost.tsx';
    import {LocalFilePreviewBody} from '/src/components/LocalFilePreviewModal.tsx';
    import {conversationFileLink} from '/src/lib/localFileLink.ts';
    function Fixture() {
      const [file,setFile]=useState(null);
      const [selected,setSelected]=useState('');
      return React.createElement(React.Fragment,null,
        React.createElement(MarkdownHost,{markdown:'[章节](/tmp/report.html#skills) [缺失章节](report.html#missing) [编码文件名](file:///tmp/a%23b.html#skills) [原样文件名](file:///tmp/report.html%23skills) [第七行](/tmp/AGENTS.project.md#L7) [无目录](/tmp/outside.md)',findFileAction:async(reference)=>reference.includes('AGENTS')?async()=>setSelected(reference):null,options:{allowRelativeLinks:true,allowAbsoluteFileLinks:true,onRelativeLinkClick:(href,_event,fileUrl)=>setFile(conversationFileLink(fileUrl??href,false))}}),
        React.createElement('output',{'data-testid':'selected-file'},selected),
        file && React.createElement(React.Fragment,null,React.createElement('output',{'data-testid':'source-path'},file.path),React.createElement(LocalFilePreviewBody,{...file,value:{kind:file.path.endsWith('.md')?'markdown':'html',htmlUrl:'/preview?path='+encodeURIComponent(file.path),content:'1\\n2\\n3\\n4\\n5\\n6\\nseventh',truncated:false}})));
    }
    createRoot(document.getElementById('root')).render(React.createElement(Fixture));`;
  const paths:string[]=[];
  let vite!:Awaited<ReturnType<typeof createServer>>;
  const server=http.createServer((req,res)=>{
    if(req.url==='/'){
      res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><div id="root"></div><script type="module" src="/fixture.js"></script>');return;
    }
    if(req.url?.startsWith('/preview?')){
      paths.push(req.url);
      res.setHeader('Content-Type','text/html');
      res.setHeader('Content-Security-Policy',"sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'");
      res.end('<!doctype html><title>Report</title><h1>Report</h1><div style="height:1600px"></div><h2 id="skills">Skills</h2><div style="height:1000px"></div>');return;
    }
    vite.middlewares(req,res);
  });
  vite=await createServer({root:new URL('../..',import.meta.url).pathname,configFile:false,esbuild:{jsx:'automatic'},server:{middlewareMode:true,hmr:{server}},appType:'custom',logLevel:'silent',plugins:[{name:'html-preview-fixture',resolveId(id){if(id==='/fixture.js')return id;},load(id){if(id==='/fixture.js')return fixture;}}]});
  t.after(async()=>{await vite.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage();page.setDefaultTimeout(8000);
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.getByRole('link',{name:'章节',exact:true}).click();
    const iframe=page.locator('iframe');
    assert.equal(await iframe.getAttribute('sandbox'),'allow-scripts');
    await page.frameLocator('iframe').getByRole('heading',{name:'Skills'}).waitFor();
    const frame=await (await iframe.elementHandle())?.contentFrame();assert.ok(frame);
    await frame.waitForFunction(()=>location.hash==='#skills'&&scrollY>1000);
    const opened=page.waitForEvent('popup');await page.getByRole('button',{name:'新标签页打开'}).click();
    const tab=await opened;await tab.waitForFunction(()=>location.hash==='#skills'&&scrollY>1000);await tab.close();
    assert.ok(paths.every(url=>!url.includes('#')));
    assert.equal(new URL(paths[0],'http://localhost').searchParams.get('path'),'/tmp/report.html');
    await page.getByRole('link',{name:'缺失章节',exact:true}).click();
    await frame.waitForFunction(()=>location.hash==='#missing'&&document.title==='Report');
    await page.getByRole('link',{name:'编码文件名',exact:true}).click();
    assert.equal(await page.getByTestId('source-path').textContent(),'/tmp/a#b.html');
    assert.match((await iframe.getAttribute('src'))!,/#skills$/);
    await page.getByRole('link',{name:'原样文件名',exact:true}).click();
    assert.equal(await page.getByTestId('source-path').textContent(),'/tmp/report.html#skills');
    assert.doesNotMatch((await iframe.getAttribute('src'))!,/#/);
    const line=page.getByRole('link',{name:'第七行',exact:true});
    await line.click();
    await page.locator('[data-preview-line="7"]').waitFor();
    assert.equal(await page.locator('[data-preview-line="7"]').textContent(),'seventh\n');
    const reveal=page.getByRole('button',{name:'在资源管理器中打开'});
    await line.hover();await reveal.waitFor();
    await reveal.hover();await reveal.click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="selected-file"]')?.textContent?.endsWith('#L7'));
    await line.focus();await reveal.waitFor();await page.keyboard.press('Tab');
    assert.equal(await reveal.evaluate(button=>button===document.activeElement),true);
    await page.keyboard.press('Escape');assert.equal(await reveal.count(),0);
    await page.getByRole('link',{name:'无目录'}).hover();
    await page.getByRole('link',{name:'无目录'}).click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="source-path"]')?.textContent==='/tmp/outside.md');
    assert.equal(await reveal.count(),0);
    const touch=await browser.newPage({hasTouch:true});
    await touch.goto(`http://127.0.0.1:${address.port}/`);
    const touched=touch.getByRole('link',{name:'第七行',exact:true});
    await touched.dispatchEvent('pointerdown',{pointerType:'touch'});
    const touchReveal=touch.getByRole('button',{name:'在资源管理器中打开'});
    await touchReveal.waitFor();
    await touched.dispatchEvent('pointerup',{pointerType:'touch'});
    await touched.dispatchEvent('click');
    assert.equal(await touch.getByTestId('source-path').count(),0);
    await touchReveal.tap();
    await touch.waitForFunction(()=>document.querySelector('[data-testid="selected-file"]')?.textContent?.endsWith('#L7'));
    await touch.close();
  }finally{await browser.close();}
});
