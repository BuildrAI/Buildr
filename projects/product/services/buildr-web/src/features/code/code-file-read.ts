import type { codeApi, CodeFile, CodeLocation, CodeReadInput, EditableFileSnapshot } from './api/code-api';

export type ExplorerCodeFile = CodeFile & {editorSnapshot?: EditableFileSnapshot; observedMatch?: {line:number;query:string}};

/** Current complete text has one authoritative editing observation, shared by both surfaces. */
export async function readExplorerFile(workspaceId:string,input:CodeReadInput & {path:string},signal:AbortSignal,reader:Pick<typeof codeApi,'editorFile'|'file'>):Promise<ExplorerCodeFile> {
  if(input.checkoutId&&!input.commitHash&&input.page===undefined&&!/\.(png|jpe?g|gif|webp)$/iu.test(input.path)) {
    const snapshot=await reader.editorFile(workspaceId,{kind:'code',repositoryId:input.repositoryId,checkoutId:input.checkoutId,path:input.path},signal);
    if(snapshot.kind!=='unsupported') {
      if(input.expectedRevision&&input.expectedRevision!==snapshot.revision)throw Error('文件已变化，请重新打开后继续阅读。');
      if(input.line) {
        const line=snapshot.content.split('\n')[input.line-1];
        if(line===undefined)throw Error('指定行号不在当前文件版本中。');
        if(input.matchQuery&&!line.toLocaleLowerCase().includes(input.matchQuery.toLocaleLowerCase()))throw Error('指定行的匹配文字已不存在，请重新搜索。');
      }
      const bytes=new TextEncoder().encode(snapshot.content);
      const hash=await crypto.subtle.digest('SHA-256',bytes);
      return {source:editingSource(input,snapshot),path:input.path,kind:snapshot.kind,content:snapshot.content,mediaType:'',sizeBytes:snapshot.sizeBytes,limitBytes:5*1024*1024,truncated:false,
        digest:'sha256-'+Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join(''),revision:snapshot.revision,page:null,observedAt:snapshot.observedAt,message:'',editorSnapshot:snapshot};
    }
  }
  return reader.file(workspaceId,input,signal);
}
function editingSource(input:CodeLocation,snapshot:EditableFileSnapshot):CodeFile['source'] {
  return {repositoryId:input.repositoryId,checkoutId:input.checkoutId||null,worktreeId:input.checkoutId||null,worktreeGroupId:null,taskId:input.taskId||null,commitHash:null,
    location:snapshot.rootPath,version:snapshot.versionLabel,kind:input.taskId?'task':'worktree'};
}
