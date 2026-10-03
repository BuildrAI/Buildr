import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';
const string = { type: 'string' }, text = { type: 'string', minLength: 1 };
const closed = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const checkoutId = { type:'string',pattern:'^checkout-[a-f0-9]{64}$' };
const source = closed({ repositoryId: text, taskId: { type: ['string','null'] }, commitHash: { type: ['string','null'] }, checkoutId:{anyOf:[checkoutId,{type:'null'}]},worktreeGroupId:{type:['string','null']},location: text, version: text, kind: { enum: ['default','task','worktree','commit'] } });
const diagnostic = closed({ code: text, message: text, repositoryId: { type: ['string','null'] } });
const entry = closed({ name: text, path: text, kind: { enum: ['directory','file','link'] }, ignored: { type: 'boolean' } });
const schema = (title: string, properties: Record<string, unknown>) => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://schemas.buildr.ai/http/code/' + title, title, ...closed(properties) });
const query=(title:string,properties:Record<string,unknown>,required:string[])=>({...schema(title,properties),required});
const locationQuery={repositoryId:text,checkoutId,taskId:text,commitHash:{type:'string',pattern:'^(?:[a-f0-9]{40}|[a-f0-9]{64})$'}};
export const CODE_HTTP_REQUESTS=Object.freeze({
  repositories:query('CodeRepositoriesQuery',{taskId:text},[]),
  directory:query('CodeDirectoryQuery',{...locationQuery,filePath:string,showIgnored:{enum:['true','false']}},['repositoryId']),
  file:query('CodeFileQuery',{...locationQuery,filePath:text,page:{type:'string',pattern:'^(?:0|[1-9][0-9]*)$'},line:{type:'string',pattern:'^[1-9][0-9]*$'},matchQuery:{type:'string',minLength:1,maxLength:200},expectedRevision:{type:'string',minLength:1,maxLength:200}},['repositoryId','filePath']),
  search:query('CodeSearchQuery',{...locationQuery,query:{type:'string',minLength:1,maxLength:200},mode:{enum:['name','content']},showIgnored:{enum:['true','false']}},['repositoryId','query']),
});
export const CODE_HTTP_SCHEMAS = Object.freeze({
  repositories: schema('CodeRepositories', {
    repositories: { type: 'array', items: closed({ id: text, code: text, name: text, location: string, available: { type:'boolean' }, gitId:{type:['string','null']} }) },
    worktrees:{type:'array',items:closed({id:checkoutId,repositoryId:text,groupId:text,path:text,branch:{type:['string','null']},kind:{enum:['main','task','worktree']},taskId:{type:['string','null']},available:{type:'boolean'}})},
    worktreeGroups:{type:'array',items:closed({id:text,name:text,kind:{enum:['main','task','worktree']},taskId:{type:['string','null']},repositoryIds:{type:'array',items:text}})},
    selectedRepositoryIds: { type:'array',items:text },selectedWorktreeGroupIds:{type:'array',items:text},scopeReason: string, diagnostics: {type:'array',items:diagnostic} }),
  directory: schema('CodeDirectory', { source, path: string, entries: {type:'array',items:entry}, truncated: {type:'boolean'}, limit: {type:'integer'}, observedAt: text }),
  file: schema('CodeFile', { source, path: text, kind: {enum:['text','markdown','image','unsupported']}, content: string, mediaType: string, sizeBytes: {type:'integer'}, limitBytes: {type:'integer'}, truncated: {type:'boolean'}, digest: text, revision:text,page:{anyOf:[{type:'null'},closed({index:{type:'integer',minimum:0},total:{type:'integer',minimum:1},offset:{type:'integer',minimum:0},endOffset:{type:'integer',minimum:0},startLine:{type:'integer',minimum:1},endLine:{type:'integer',minimum:1},startsMidLine:{type:'boolean'},endsMidLine:{type:'boolean'},matchOffset:{type:'integer',minimum:0},matchEndOffset:{type:'integer',minimum:0}},['index','total','offset','endOffset','startLine','endLine','startsMidLine','endsMidLine'])]},observedAt:text, message:string }),
  search: schema('CodeSearch', { source, matches:{type:'array',maxItems:100,items:closed({path:text,line:{type:['integer','null']},excerpt:string,occurrences:{type:'array',maxItems:200,items:closed({line:{type:'integer',minimum:1},excerpt:string})}},['path','line','excerpt'])}, scannedFiles:{type:'integer'}, truncated:{type:'boolean'}, limit:{type:'integer'}, diagnostics:{type:'array',items:diagnostic}, observedAt:text }),
});
export const CODE_HTTP_OPERATIONS=Object.freeze(Object.entries(CODE_HTTP_SCHEMAS).map(([name,output])=>({id:'code.'+name,owner:'code',method:'GET',path:'/code/'+name,disposition:'migrated-json',responseKind:'json',requestSchemaId:CODE_HTTP_REQUESTS[name as keyof typeof CODE_HTTP_REQUESTS].$id,successSchemaId:output.$id,errorSchemaId:'https://schemas.buildr.ai/http/local-app/error/response/v1'})));
export const CODE_HTTP_VALIDATORS = compileJsonSchemaCatalog([...Object.values(CODE_HTTP_SCHEMAS),...Object.values(CODE_HTTP_REQUESTS)]);
