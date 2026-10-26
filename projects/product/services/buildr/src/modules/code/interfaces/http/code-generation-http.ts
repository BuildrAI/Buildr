import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';
import type { CodeCommitMessageApplication, CodeCommitMessageInput } from '../../application/code-commit-message-application.ts';
import type { CodeGeneration } from '../../application/code-generation.ts';
import { codeFailure } from '../../infrastructure/code-file-reader.ts';

const text={type:'string',minLength:1,maxLength:200};
const schema=(title:string,properties:Record<string,unknown>,required=Object.keys(properties))=>({$schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://schemas.buildr.ai/http/code-generation/'+title,title,type:'object',additionalProperties:false,properties,required});
const request=schema('CodeCommitMessageRequest',{
  repositoryId:text,worktreeId:{type:'string',pattern:'^checkout-[a-f0-9]{64}$'},expectedRevision:text,
  modelAccountId:text,modelId:text,accountIdentity:text,accountRevision:text,label:text,serviceTier:text,
},['repositoryId','worktreeId','expectedRevision','modelAccountId','modelId','accountIdentity','accountRevision','label']);
const run=schema('CodeCommitMessageRun',{id:text,modelAccountId:text,modelId:text,label:text,accountRevision:text,
  status:{enum:['running','succeeded','failed','cancelled']},output:{},
  error:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,properties:{code:text,message:{type:'string',minLength:1}},required:['code','message']}]},
});
const cancel=schema('CodeCommitMessageCancel',{runId:text});
export const CODE_GENERATION_HTTP_SCHEMAS=Object.freeze({run});
const validators=compileJsonSchemaCatalog([request,run,cancel]);
export const CODE_GENERATION_HTTP_OPERATIONS=Object.freeze([
  {id:'code.commitMessage',method:'POST',path:'/code/commit-message',requestSchemaId:request.$id},
  {id:'code.commitMessageRun',method:'GET',path:'/code/commit-message-runs'},
  {id:'code.cancelCommitMessage',method:'POST',path:'/code/commit-message-cancel',requestSchemaId:cancel.$id},
].map(operation=>({...operation,owner:'code',disposition:'migrated-json',responseKind:'json',successSchemaId:run.$id,errorSchemaId:'https://schemas.buildr.ai/http/local-app/error/response/v1'})));
type HttpInput={request:{method?:string};suffix:string;searchParams:URLSearchParams;root:string;authorizeRead?:()=>void;authorizeWrite?:()=>void;readJsonBody?:()=>Promise<unknown>};
export function createCodeGenerationHttpContribution(application:CodeCommitMessageApplication,runs:CodeGeneration){
  return Object.freeze({id:'code.generation.http',schemas:{...CODE_GENERATION_HTTP_SCHEMAS,request,cancel},operations:CODE_GENERATION_HTTP_OPERATIONS,
    async handle({request:incoming,suffix,searchParams,root,authorizeRead,authorizeWrite,readJsonBody}:HttpInput){
      let body:unknown;
      if(incoming.method==='GET'&&suffix==='/code/commit-message-runs'){
        if(!authorizeRead)throw codeFailure('code_generation_unauthorized','生成查询缺少本机会话授权。',403);authorizeRead();
        if(searchParams.size!==1||!searchParams.get('runId'))throw codeFailure('code_query_invalid','生成查询只接受准确请求编号。');
        body=runs.read(root,searchParams.get('runId')!);
      }else if(incoming.method==='POST'&&['/code/commit-message','/code/commit-message-cancel'].includes(suffix)){
        if(!authorizeWrite||!readJsonBody)throw codeFailure('code_generation_unauthorized','生成请求缺少本机会话授权。',403);authorizeWrite();
        if(searchParams.size)throw codeFailure('code_query_invalid','生成接口不接受查询参数。');
        const input=await readJsonBody(),id=suffix==='/code/commit-message'?request.$id:cancel.$id;
        if(!validators.validate(id,input).valid)throw codeFailure('code_generation_invalid','生成请求不符合契约。');
        body=suffix==='/code/commit-message'?await application.generateCommitMessage(root,input as CodeCommitMessageInput):runs.cancel(root,(input as {runId:string}).runId);
      }else return null;
      if(!validators.validate(run.$id,body).valid)throw codeFailure('code_response_invalid','生成结果不符合契约。',500);
      return{status:incoming.method==='POST'&&suffix==='/code/commit-message'?202:200,body};
    },
  });
}
