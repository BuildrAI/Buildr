import type { CodeApplication, CodeInput } from '../../application/code-application.ts';
import { CODE_HTTP_SCHEMAS, CODE_HTTP_REQUESTS, CODE_HTTP_OPERATIONS, CODE_HTTP_VALIDATORS } from './code-http-contracts.ts';
import { codeFailure } from '../../infrastructure/code-file-reader.ts';
export function createCodeHttpContribution(application:CodeApplication) {
  return Object.freeze({id:'code.files.http',schemas:{...CODE_HTTP_SCHEMAS,...Object.fromEntries(Object.entries(CODE_HTTP_REQUESTS).map(([key,value])=>[key+'Request',value]))},operations:CODE_HTTP_OPERATIONS,handle:async({request,suffix,searchParams,root,submitTaskRead}:{request:{method?:string};suffix:string;searchParams:URLSearchParams;root:string;submitTaskRead?:(operation:string,readId:string,input:Record<string,string>)=>Promise<unknown>})=>{
    const match=suffix.match(/^\/code\/(repositories|directory|file|search)$/);
    if(request.method!=='GET'||!match)return null;
    const operation=match[1] as keyof CodeApplication;
    const allowed=Object.keys(CODE_HTTP_REQUESTS[operation].properties);
    for(const key of searchParams.keys())if(!allowed.includes(key)||searchParams.getAll(key).length!==1)throw codeFailure('code_query_invalid','代码读取查询参数无效。');
    const values=Object.fromEntries(searchParams);
    if(!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS[operation].$id,values).valid)throw codeFailure('code_query_invalid','代码读取查询参数不符合契约。');
    if(operation!=='repositories'&&!values.repositoryId)throw codeFailure('code_query_invalid','必须选择代码库。');
    if(values.showIgnored&&!['true','false'].includes(values.showIgnored))throw codeFailure('code_query_invalid','忽略文件选项无效。');
    if(values.mode&&!['name','content'].includes(values.mode))throw codeFailure('code_query_invalid','搜索模式无效。');
    const {filePath,page,line,...query}=values;
    const input={...query,path:filePath,showIgnored:values.showIgnored==='true',...(page===undefined?{}:{page:Number(page)}),...(line===undefined?{}:{line:Number(line)})} as CodeInput;
    const body=await(submitTaskRead?submitTaskRead('code-'+operation,'code-files',{input:JSON.stringify(input)}):operation==='repositories'?application.repositories(root,values.taskId):application[operation](root,input));
    if(!CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS[operation].$id,body).valid)throw codeFailure('code_response_invalid','代码读取结果不符合契约。',500);
    return {status:200,body};
  }});
}
