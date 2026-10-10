import type { CodeApplication, CodeInput } from '../../application/code-application.ts';
import { CODE_HTTP_SCHEMAS, CODE_HTTP_REQUESTS, CODE_HTTP_OPERATIONS, CODE_HTTP_VALIDATORS, CODE_HTTP_PATHS } from './code-http-contracts.ts';
import { codeFailure } from '../../infrastructure/code-file-reader.ts';
import type { CodeBranchSwitchInput } from '../../application/source-control-model.ts';
import type { CodeCommitChangesInput, CodePushInput } from '../../application/code-commit-model.ts';
export function createCodeHttpContribution(application:CodeApplication) {
  return Object.freeze({id:'code.files.http',schemas:{...CODE_HTTP_SCHEMAS,...Object.fromEntries(Object.entries(CODE_HTTP_REQUESTS).map(([key,value])=>[key+'Request',value]))},operations:CODE_HTTP_OPERATIONS,handle:async({request,suffix,searchParams,root,submitTaskRead,authorizeWrite,readJsonBody}:{request:{method?:string};suffix:string;searchParams:URLSearchParams;root:string;submitTaskRead?:(operation:string,readId:string,input:Record<string,string>)=>Promise<unknown>;authorizeWrite?:()=>void;readJsonBody?:()=>Promise<unknown>})=>{
    if (request.method === 'POST' && ['/code/commit-changes','/code/push'].includes(suffix)) {
      if (!authorizeWrite || !readJsonBody) throw codeFailure('code_write_unauthorized','写入请求缺少本机会话（Session）授权。',403);
      authorizeWrite();
      if (searchParams.size) throw codeFailure('code_query_invalid','Git 写入接口不接受查询参数。');
      const operation = suffix === '/code/push' ? 'push' : 'commitChanges', input = await readJsonBody();
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS[operation].$id,input).valid) throw codeFailure('code_commit_input_invalid','Git 写入请求不符合契约。');
      const body = operation === 'push' ? await application.push(root,input as CodePushInput) : await application.commitChanges(root,input as CodeCommitChangesInput);
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS[operation].$id,body).valid) throw codeFailure('code_response_invalid','Git 写入结果不符合契约。',500);
      return {status:200,body};
    }
    if (request.method === 'POST' && suffix === '/code/branch-switch') {
      if (!authorizeWrite || !readJsonBody) throw codeFailure('code_branch_write_unauthorized','切换请求缺少本机会话（Session）授权。',403);
      authorizeWrite();
      if (searchParams.size) throw codeFailure('code_query_invalid','切换接口（API）不接受查询参数。');
      const input = await readJsonBody();
      if (!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS.branchSwitch.$id,input).valid) throw codeFailure('code_branch_switch_invalid','切换请求不符合契约。');
      const body = application.switchBranch(root,input as CodeBranchSwitchInput);
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
    if(operation!=='repositories'&&operation!=='sourceControl'&&!values.repositoryId)throw codeFailure('code_query_invalid','必须选择代码库。');
    if(values.showIgnored&&!['true','false'].includes(values.showIgnored))throw codeFailure('code_query_invalid','忽略文件选项无效。');
    if(values.mode&&!['name','content'].includes(values.mode))throw codeFailure('code_query_invalid','搜索模式无效。');
    const {filePath,page,line,limit,...query}=values;
    const input={...query,path:filePath,showIgnored:values.showIgnored==='true',...(page===undefined?{}:{page:Number(page)}),...(line===undefined?{}:{line:Number(line)}),...(limit===undefined?{}:{limit:Number(limit)})} as CodeInput;
    const body=await(submitTaskRead?submitTaskRead('code-'+CODE_HTTP_PATHS[operation],'code-files',{input:JSON.stringify(input)}):operation==='repositories'?application.repositories(root,values.taskId):application[operation](root,input));
    if(!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS[operation].$id,body).valid)throw codeFailure('code_response_invalid','代码读取结果不符合契约。',500);
    return {status:200,body};
  }});
}
