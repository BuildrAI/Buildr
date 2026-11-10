import type { CodeDiscardInput } from '../../application/code-discard-application.ts';
import type { CodeApplication, CodeInput } from '../../application/code-application.ts';
import { CODE_HTTP_SCHEMAS, CODE_HTTP_REQUESTS, CODE_HTTP_OPERATIONS, CODE_HTTP_VALIDATORS, CODE_HTTP_PATHS } from './code-http-contracts.ts';
import { codeFailure } from '../../infrastructure/code-file-reader.ts';
import type { CodeBranchSwitchInput } from '../../application/source-control-model.ts';
import type { CodeFetchInput } from '../../application/code-fetch-application.ts';
import type { CodeSyncInput } from '../../application/code-sync-application.ts';
import type { CodeCommitChangesInput, CodePushInput } from '../../application/code-commit-model.ts';
import type { EditorFileSelector, SaveEditorFileInput } from '../../application/file-editing-application.ts';
import { EDITABLE_FILE_JSON_BYTES } from '../../infrastructure/editable-file.ts';
import type { SourceControlObservations } from '../../application/source-control-observations.ts';
import type { CodeSourceControlResponse } from '../../application/source-control-model.ts';
type WatchRequest = { method?: string; once?(event: string, listener: () => void): unknown; removeListener?(event: string, listener: () => void): unknown; socket?: { once(event: string, listener: () => void): unknown; removeListener(event: string, listener: () => void): unknown } };
export function createCodeHttpContribution(application:CodeApplication, observations?:SourceControlObservations) {
  async function write<T>(root: string, ids: string[] | undefined, action: () => T | Promise<T>): Promise<T> {
    observations?.invalidateReads(root,ids);
    try { return await action(); } finally { observations?.invalidateReads(root,ids); }
  }
  return Object.freeze({id:'code.files.http',schemas:{...CODE_HTTP_SCHEMAS,...Object.fromEntries(Object.entries(CODE_HTTP_REQUESTS).map(([key,value])=>[key+'Request',value]))},operations:CODE_HTTP_OPERATIONS,handle:async({request,suffix,searchParams,root,submitTaskRead,submitTaskWrite,authorizeWrite,readJsonBody}:{request:WatchRequest;suffix:string;searchParams:URLSearchParams;root:string;submitTaskRead?:(operation:string,readId:string,input:Record<string,string>,signal?:AbortSignal)=>Promise<unknown>;submitTaskWrite?:(operation:string,input:Record<string,string>)=>Promise<unknown>;authorizeWrite?:()=>void;readJsonBody?:(maxBytes?:number)=>Promise<unknown>})=>{
    if (request.method === 'GET' && suffix === '/code/source-control-watch') {
      if ([...searchParams.keys()].some(key => key !== 'cursor' || searchParams.getAll(key).length !== 1) || !CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS.sourceControlWatch.$id,Object.fromEntries(searchParams)).valid) throw codeFailure('code_query_invalid','代码状态观察参数无效。');
      if (!observations) throw codeFailure('code_watch_unavailable','代码状态观察暂不可用。',503);
      const controller = new AbortController(), abort = () => controller.abort();
      request.once?.('aborted',abort); request.socket?.once('close',abort);
      try {
        const body = await observations.watch(root,searchParams.get('cursor') ?? undefined,controller.signal);
        if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.sourceControlWatch.$id,body).valid) throw codeFailure('code_response_invalid','代码状态观察结果不符合契约。',500);
        return {status:200,body};
      } finally { request.removeListener?.('aborted',abort); request.socket?.removeListener('close',abort); }
    }
    if (request.method === 'GET' && suffix === '/code/editor-file') {
      const allowed=Object.keys(CODE_HTTP_REQUESTS.editorFile.properties);
      for(const key of searchParams.keys())if(!allowed.includes(key)||searchParams.getAll(key).length!==1)throw codeFailure('file_query_invalid','文件编辑查询参数无效。');
      const values=Object.fromEntries(searchParams);
      if(!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS.editorFile.$id,values).valid)throw codeFailure('file_query_invalid','文件编辑查询参数不符合契约。');
      const selector:EditorFileSelector=values.kind==='code'?{kind:'code',repositoryId:values.repositoryId,checkoutId:values.checkoutId,path:values.filePath}:{kind:'project',projectCode:values.projectCode,path:values.filePath};
      const body=await(submitTaskRead?submitTaskRead('code-editor-file','code-files',{input:JSON.stringify(selector)}):application.editorFile(root,selector));
      if(!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.editorFile.$id,body).valid)throw codeFailure('code_response_invalid','文件编辑读取结果不符合契约。',500);
      return {status:200,body};
    }
    if (request.method === 'POST' && suffix === '/code/save-file') {
      if(!authorizeWrite||!readJsonBody)throw codeFailure('file_write_unauthorized','保存请求缺少本机会话（Session）授权。',403);
      authorizeWrite();
      if(searchParams.size)throw codeFailure('file_query_invalid','文件保存不接受查询参数。');
      const input=await readJsonBody(EDITABLE_FILE_JSON_BYTES);
      if(!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS.saveFile.$id,input).valid)throw codeFailure('file_save_input_invalid','文件保存请求不符合契约。');
      const save = input as SaveEditorFileInput;
      const body=await write(root,save.selector.kind === 'code' ? [save.selector.repositoryId] : undefined,() => application.saveFile(root,save));
      if(!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.saveFile.$id,body).valid)throw codeFailure('code_response_invalid','文件保存结果不符合契约。',500);
      return {status:200,body};
    }
    if (request.method === 'POST' && suffix === '/code/discard-changes') {
      if (!authorizeWrite || !readJsonBody) throw codeFailure('code_write_unauthorized','丢弃请求缺少本机会话（Session）授权。',403);
      authorizeWrite();
      if (searchParams.size) throw codeFailure('code_query_invalid','丢弃接口不接受查询参数。');
      const input = await readJsonBody();
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS.discardChanges.$id,input).valid) throw codeFailure('code_discard_input_invalid','丢弃请求不符合契约。');
      const body = await write(root,[(input as CodeDiscardInput).repositoryId],() => submitTaskWrite?submitTaskWrite('code-discard-changes',{input:JSON.stringify(input)}):application.discardChanges(root,input as CodeDiscardInput));
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.discardChanges.$id,body).valid) throw codeFailure('code_response_invalid','丢弃结果不符合契约。',500);
      return {status:200,body};
    }
    if (request.method === 'POST' && ['/code/commit-changes','/code/push'].includes(suffix)) {
      if (!authorizeWrite || !readJsonBody) throw codeFailure('code_write_unauthorized','写入请求缺少本机会话（Session）授权。',403);
      authorizeWrite();
      if (searchParams.size) throw codeFailure('code_query_invalid','Git 写入接口不接受查询参数。');
      const operation = suffix === '/code/push' ? 'push' : 'commitChanges', input = await readJsonBody();
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS[operation].$id,input).valid) throw codeFailure('code_commit_input_invalid','Git 写入请求不符合契约。');
      const body = await write(root,[(input as CodePushInput).repositoryId],() => operation === 'push' ? (submitTaskWrite?submitTaskWrite('code-push',{input:JSON.stringify(input)}):application.push(root,input as CodePushInput)) : (submitTaskWrite?submitTaskWrite('code-commit-changes',{input:JSON.stringify(input)}):application.commitChanges(root,input as CodeCommitChangesInput)));
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS[operation].$id,body).valid) throw codeFailure('code_response_invalid','Git 写入结果不符合契约。',500);
      return {status:200,body};
    }
    if (request.method === 'POST' && suffix === '/code/sync') {
      if (!authorizeWrite || !readJsonBody) throw codeFailure('code_write_unauthorized','同步请求缺少本机会话（Session）授权。',403);
      authorizeWrite();
      if (searchParams.size) throw codeFailure('code_query_invalid','同步接口不接受查询参数。');
      const input = await readJsonBody();
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS.sync.$id,input).valid) throw codeFailure('code_sync_input_invalid','同步请求不符合契约。');
      const body = await write(root,[(input as CodeSyncInput).repositoryId],() => submitTaskWrite?submitTaskWrite('code-sync',{input:JSON.stringify(input)}):application.sync(root,input as CodeSyncInput));
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.sync.$id,body).valid) throw codeFailure('code_response_invalid','同步结果不符合契约。',500);
      return {status:200,body};
    }
    if (request.method === 'POST' && suffix === '/code/fetch') {
      if (!authorizeWrite || !readJsonBody) throw codeFailure('code_write_unauthorized','获取请求缺少本机会话（Session）授权。',403);
      authorizeWrite();
      if (searchParams.size) throw codeFailure('code_query_invalid','获取远程接口不接受查询参数。');
      const input = await readJsonBody();
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS.fetch.$id,input).valid) throw codeFailure('code_fetch_input_invalid','获取远程请求不符合契约。');
      const body = await write(root,(input as CodeFetchInput).repositories.map(value => value.repositoryId),() => submitTaskWrite?submitTaskWrite('code-fetch',{input:JSON.stringify(input)}):application.fetch(root,input as CodeFetchInput));
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.fetch.$id,body).valid) throw codeFailure('code_response_invalid','获取远程结果不符合契约。',500);
      return {status:200,body};
    }
    if (request.method === 'POST' && suffix === '/code/repository-clone') {
      if (!authorizeWrite || !readJsonBody) throw codeFailure('code_write_unauthorized','克隆请求缺少本机会话（Session）授权。',403);
      authorizeWrite();
      if (searchParams.size) throw codeFailure('code_query_invalid','克隆接口不接受查询参数。');
      const input = await readJsonBody();
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS.repositoryClone.$id,input).valid) throw codeFailure('code_clone_input_invalid','克隆请求不符合契约。');
      const body = application.repositoryClone(root,(input as { repositoryId: string }).repositoryId);
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.repositoryClone.$id,body).valid) throw codeFailure('code_response_invalid','克隆结果不符合契约。',500);
      return {status:200,body};
    }
    if (request.method === 'POST' && suffix === '/code/branch-switch') {
      if (!authorizeWrite || !readJsonBody) throw codeFailure('code_branch_write_unauthorized','切换请求缺少本机会话（Session）授权。',403);
      authorizeWrite();
      if (searchParams.size) throw codeFailure('code_query_invalid','切换接口（API）不接受查询参数。');
      const input = await readJsonBody();
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS.branchSwitch.$id,input).valid) throw codeFailure('code_branch_switch_invalid','切换请求不符合契约。');
      const body = await write(root,[(input as CodeBranchSwitchInput).repositoryId],() => submitTaskWrite?submitTaskWrite('code-branch-switch',{input:JSON.stringify(input)}):application.switchBranch(root,input as CodeBranchSwitchInput));
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.branchSwitch.$id,body).valid) throw codeFailure('code_response_invalid','切换结果不符合契约。',500);
      return {status:200,body};
    }
    const match=suffix.match(/^\/code\/([^/]+)$/);
    if(request.method!=='GET'||!match)return null;
    const operation=Object.keys(CODE_HTTP_PATHS).find(key=>CODE_HTTP_PATHS[key as keyof typeof CODE_HTTP_PATHS]===match[1]) as keyof typeof CODE_HTTP_PATHS|undefined;
    if(!operation)return null;
    const allowed=Object.keys(CODE_HTTP_REQUESTS[operation].properties);
    for(const key of searchParams.keys())if(!allowed.includes(key)||searchParams.getAll(key).length!==1)throw codeFailure('code_query_invalid','代码读取查询参数无效。');
    const values=Object.fromEntries(searchParams);
    if(!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS[operation].$id,values).valid)throw codeFailure('code_query_invalid','代码读取查询参数不符合契约。');
    if(operation!=='repositories'&&operation!=='sourceControl'&&operation!=='sourceControlInventory'&&!values.repositoryId)throw codeFailure('code_query_invalid','必须选择代码库。');
    if(values.showIgnored&&!['true','false'].includes(values.showIgnored))throw codeFailure('code_query_invalid','忽略文件选项无效。');
    if(values.mode&&!['name','content'].includes(values.mode))throw codeFailure('code_query_invalid','搜索模式无效。');
    const {filePath,page,line,limit,observation,...query}=values;
    const input=(operation==='sourceControlInventory'?values:{...query,path:filePath,showIgnored:values.showIgnored==='true',...(page===undefined?{}:{page:Number(page)}),...(line===undefined?{}:{line:Number(line)}),...(limit===undefined?{}:{limit:Number(limit)})}) as CodeInput;
    if (operation === 'sourceControl' && observation === 'shared' && values.repositoryId && observations) {
      const inventory = application.sourceControlInventory(root, values.taskId ? {taskId:values.taskId} : {});
      const body = await observations.readShared(root, {taskId:values.taskId, repositoryId:values.repositoryId}, inventory, async signal => {
        const value = await (submitTaskRead ? submitTaskRead('code-source-control','code-files',{input:JSON.stringify(input)},signal) : application.sourceControl(root,input));
        if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.sourceControl.$id,value).valid) throw codeFailure('code_response_invalid','代码读取结果不符合契约。',500);
        return value as CodeSourceControlResponse;
      });
      return {status:200,body};
    }
    if (operation === 'sourceControl') observations?.invalidateReads(root, values.repositoryId ? [values.repositoryId] : undefined);
    const observationTicket=operation==='sourceControl'?observations?.beginRead(root):undefined;
    // Registration-only inventory performs no Git reads. Keep it lightweight so
    // the first two real status reads can start their bounded workers together.
    const body=await(operation==='sourceControlInventory'?application.sourceControlInventory(root,input):submitTaskRead?submitTaskRead('code-'+CODE_HTTP_PATHS[operation],'code-files',{input:JSON.stringify(input)}):operation==='repositories'?application.repositories(root,values.taskId):application[operation](root,input));
    if(!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS[operation].$id,body).valid)throw codeFailure('code_response_invalid','代码读取结果不符合契约。',500);
    // Watcher discovery must not delay or invalidate a successful authoritative read.
    if(operation==='sourceControl'&&observations&&observationTicket)void observations.observe(root,body as CodeSourceControlResponse,Boolean(values.repositoryId),observationTicket).catch(()=>{});
    if(operation==='sourceControlInventory'&&observations)void observations.observeInventory(root,body as CodeSourceControlResponse).catch(()=>{});
    return {status:200,body};
  }});
}
