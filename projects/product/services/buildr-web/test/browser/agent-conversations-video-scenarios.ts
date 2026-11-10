import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type {AgentConversationFixture} from './agent-conversation-fixture.ts';

/** video 场景使用独立准备的对话现场。 */
export async function runVideoScenarios(fixture:AgentConversationFixture){
  const {capture,chooseAgent,conversation,input,page,panel,run,sentInputs,step,update,uploadedMedia,workspaceRoot}=fixture;
await step('视频选择、粘贴与拖入均保留原件和画面，发送及刷新可播放，解码失败保留文字',async()=>{
      await page.setViewportSize({width:1280,height:900});
      await panel().getByRole('button',{name:'新建对话',exact:true}).click();await input().waitFor();await chooseAgent('Codex');await input().fill('录屏说明保留');
      const recording=await page.evaluate(async()=>{
        const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const drawing=canvas.getContext('2d')!;
        drawing.fillStyle='#256d4f';drawing.fillRect(0,0,160,90);
        const stream=canvas.captureStream(12),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks:Blob[]=[];
        recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
        const stopped=new Promise<void>(resolve=>{recorder.onstop=()=>resolve();});recorder.start(50);
        await new Promise(resolve=>setTimeout(resolve,150));drawing.fillStyle='#ebaa43';drawing.fillRect(40,20,80,50);
        await new Promise(resolve=>setTimeout(resolve,150));recorder.stop();await stopped;for(const track of stream.getTracks())track.stop();
        return Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()));
      });
      const buffer=Buffer.from(recording),file={name:'录屏.webm',mimeType:'video/webm',buffer};
      await panel().locator('.ac-compose-wrap input[type=file]').setInputFiles({name:'损坏.mp4',mimeType:'video/mp4',buffer:Buffer.from('not a video')});
      await panel().getByText('视频编码无法解码，请换用浏览器可播放的 MP4 或 WebM。',{exact:true}).waitFor();assert.equal(await input().inputValue(),'录屏说明保留');
      for(const method of ['file','paste','drop']){
        if(method==='file')await panel().locator('.ac-compose-wrap input[type=file]').setInputFiles(file);
        else await input().evaluate((node:HTMLElement,detail:{method:string;bytes:number[]})=>{
          const data=new DataTransfer();data.items.add(new File([new Uint8Array(detail.bytes)],'录屏.webm',{type:'video/webm'}));
          node.dispatchEvent(detail.method==='paste'?new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}):new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));
        },{method,bytes:recording});
        const remove=panel().getByRole('button',{name:'移除视频 录屏.webm',exact:true});await remove.waitFor();
        await page.waitForFunction(()=>{const video=document.querySelector<HTMLVideoElement>('.ac-composer video');return Boolean(video&&video.readyState>=2&&video.videoWidth===160);});
        assert.equal(await input().inputValue(),'录屏说明保留');
        const stored=uploadedMedia.get('image-fixture-'+fixture.attachmentUploads)!;assert.equal(stored.mimeType,'video/webm');assert.deepEqual(stored.bytes,buffer);assert.ok(stored.video.frames.length>=2);
        await panel().locator('.ac-video-thumbnail[title="录屏.webm"]').hover();
        await remove.click();await remove.waitFor({state:'hidden'});
      }
      await panel().locator('.ac-compose-wrap input[type=file]').setInputFiles(file);await panel().getByRole('button',{name:'移除视频 录屏.webm',exact:true}).waitFor();
      const originalId='image-fixture-'+fixture.attachmentUploads,creationsBeforeVideo=fixture.creations;assert.equal(await panel().getAttribute('data-conversation-id'),null);
      await page.reload();await panel().getByRole('button',{name:'移除视频 录屏.webm',exact:true}).waitFor();await page.waitForFunction(()=>{const video=document.querySelector<HTMLVideoElement>('.ac-composer video');return Boolean(video&&video.readyState>=2&&video.videoWidth===160);});assert.equal(fixture.creations,creationsBeforeVideo);assert.equal(await panel().getAttribute('data-conversation-id'),null);assert.equal(await input().inputValue(),'录屏说明保留');
      await panel().getByRole('button',{name:'发送对话',exact:true}).click();await panel().locator('[data-run-status="running"]').waitFor();assert.deepEqual(sentInputs.at(-1).attachmentIds,[originalId]);
      await panel().locator('.ac-message-images video').waitFor();await page.reload();await panel().locator('.ac-message-images video').waitFor();
      await page.waitForFunction(()=>{const video=document.querySelector<HTMLVideoElement>('.ac-message-images video');return Boolean(video&&video.readyState>=2&&video.videoWidth===160);});
      await capture(page,'agent-conversation-video.png');
      await panel().getByRole('button',{name:'停止本次执行',exact:true}).click();await panel().locator('[data-run-status="stopped"]').waitFor();
    });
  await step('对话 Markdown 图片按可访问路径显示，缺失图片给出说明',async()=>{
    const imagePath=path.join(workspaceRoot,'conversation-markdown.png');
    fs.writeFileSync(imagePath,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAIAAACwpMoFAAAAwUlEQVR42u3bMQ0AIRREQZzggR5baEAE4igpkYCF6w5+JnkKdupNuRYFLpkAsADrCeA2ugIEGLAAC7AAC7AACzBgwIAFWIAFWIAFGDBgwAIswAIswAIswIAFWG8Cz70UIMCABViABViABViAAQMGLMACLMACLMCAAQMWYAEWYAEWYAEGLMACLMACLMD6Dux46R8swAIswAIswIABAxZgARZgARZgAQYswAIswAIswIABAxZg/QeseAEGLMC6tgOkuRgbjUznoQAAAABJRU5ErkJggg==','base64'));
    update({entries:[{id:'markdown-image',sequence:1,kind:'message',role:'assistant',runId:'run-fixture',text:`本机图片\n\n![本机图片](<${imagePath}>)\n\n![缺失图片](file:///conversation-missing.png)`,createdAt:new Date().toISOString()}],run:run('completed','codex')});
    await page.reload();await input().waitFor();
    const article=panel().locator('[data-entry-id="markdown-image"]'),image=article.getByAltText('本机图片',{exact:true});await image.waitFor();
    await page.waitForFunction(()=>{const node=document.querySelector<HTMLImageElement>('[data-entry-id="markdown-image"] img[alt="本机图片"]');return Boolean(node&&node.complete&&node.naturalWidth===160&&node.naturalHeight===90);});
    assert.equal(await article.getByText('![本机图片]',{exact:false}).count(),0,'图片源码不再作为正文出现');
    const fallback=article.locator('.markdown-image-fallback');await fallback.waitFor();assert.match(await fallback.innerText(),/图片无法预览：缺失图片/);
    await capture(page,'agent-conversation-markdown-image.png');
  });


}
