import { createHash } from 'node:crypto';
import { ModelAccessError, type ModelOffering, type ModelProvider, type ModelProviderObservation, type ModelProviderRuntime, type ProviderInferenceInput } from '../contracts.ts';
import { PrivateApiKey } from './private-api-key.ts';
import { record, string, positive } from './private-account.ts';

const BASE='https://api.anthropic.com/v1';
const identity=(key:string)=>createHash('sha256').update('anthropic-api:'+key).digest('hex');
export function createAnthropicApiModelProvider(options:{fetch?:typeof fetch}={}):ModelProvider {
  return {
    id:'anthropic',label:'Claude API',singleton:true,group:{id:'anthropic',label:'Claude'},modeLabel:'API Key',
    authentication:{type:'api-key',label:'API Key',placeholder:'sk-ant-...',description:'使用 Anthropic 官方 API，不使用 claude.ai 订阅登录或额度。'},
    sharing:{kind:'gateway'},
    inference:'gateway',
    presentation:{
      vendorLabel:'Anthropic',
      sourceLabel:'Claude API',
      quotaLabel:'Claude API',
      apiKeyHint:'sk-ant-...',
      quotaUnavailableNote:'Anthropic API 未提供剩余额度观察；请在 Anthropic 平台查看用量与账单。',
    },
    async open(input){return new AnthropicApiRuntime(new PrivateApiKey(input.configRoot),options.fetch??fetch);},
  };
}
class AnthropicApiRuntime implements ModelProviderRuntime {
  readonly protocol='anthropic-messages' as const;
  private readonly store:PrivateApiKey;
  private readonly fetch:typeof fetch;
  private readonly lifetime=new AbortController();
  private key?:string;
  private models=new Map<string,ModelOffering>();
  constructor(store:PrivateApiKey,fetcher:typeof fetch){this.store=store;this.fetch=fetcher;}
  private headers(key:string){return {'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'};}
  private async catalog(key:string):Promise<ModelOffering[]> {
    const models:ModelOffering[]=[];let after:string|undefined;
    const cursors=new Set<string>();
    for(let page=0;page<100;page++){
      const url=new URL(BASE+'/models');url.searchParams.set('limit','100');if(after)url.searchParams.set('after_id',after);
      const response=await this.fetch(url,{headers:this.headers(key),redirect:'error',signal:AbortSignal.any([this.lifetime.signal,AbortSignal.timeout(15000)])});
      if(!response.ok){await response.body?.cancel();throw new ModelAccessError(response.status===401?'model_anthropic_authentication_failed':'model_anthropic_catalog_failed','Claude API 模型目录读取失败，请核对密钥、权限或网络。',response.status);}
      const body=record(await response.json());
      if(!Array.isArray(body.data))throw new Error('model_anthropic_catalog_invalid');
      for(const value of body.data){
        const row=record(value),id=string(row.id);if(!id?.startsWith('claude-'))continue;
        const capabilities=record(row.capabilities);
        const images=record(capabilities.image_input).supported;
        const effort=record(capabilities.effort);
        const efforts=effort.supported===true?['low','medium','high','xhigh','max'].filter(level=>record(effort[level]).supported===true).map(id=>({id,label:id})):[];
        models.push({id,label:string(row.display_name)??id,tools:true,images:images===true,
          ...(efforts.length?{reasoningEfforts:efforts}:{}),
          ...(positive(row.max_input_tokens)?{contextWindow:positive(row.max_input_tokens)}:{}),
          ...(positive(row.max_tokens)?{maxOutputTokens:positive(row.max_tokens)}:{})});
      }
      if(body.has_more!==true){
        if(!models.length)throw new Error('model_anthropic_catalog_empty');
        return models;
      }
      const cursor=string(body.last_id);if(!cursor||cursors.has(cursor))throw new Error('model_anthropic_catalog_invalid');
      cursors.add(cursor);after=cursor;
    }
    throw new Error('model_anthropic_catalog_too_large');
  }
  async inspect():Promise<ModelProviderObservation>{
    const key=this.key??await this.store.read();
    if(!key)return {status:'not-authenticated',models:[],credentialConfigured:false};
    try{
      const models=await this.catalog(key);this.key=key;this.models=new Map(models.map(model=>[model.id,model]));
      return {status:'ready',label:'Claude API',identity:identity(key),credentialConfigured:true,models,
        quota:{available:false,observedAt:new Date().toISOString(),summary:'Anthropic API 未提供可用的剩余额度观察。'}};
    }catch(error){return {status:error instanceof ModelAccessError&&error.status===401?'expired':'failed',incomplete:!(error instanceof ModelAccessError&&error.status===401),credentialConfigured:true,models:[],diagnostic:error instanceof ModelAccessError?error.code:'model_anthropic_catalog_failed'};}
  }
  async configure(input:{apiKey:string}):Promise<ModelProviderObservation>{
    const key=input.apiKey.trim();
    if(!key||key.length>4096||/[\r\n]/.test(key))throw new ModelAccessError('model_anthropic_api_key_invalid','API Key 无效。',400);
    const models=await this.catalog(key);
    await this.store.save(key);this.key=key;this.models=new Map(models.map(model=>[model.id,model]));
    return {status:'ready',label:'Claude API',identity:identity(key),credentialConfigured:true,models};
  }
  async beginLogin():Promise<void>{throw new ModelAccessError('model_anthropic_api_key_required','Claude API 需要 API Key，不提供 claude.ai 订阅登录。',400);}
  async cancelLogin():Promise<void>{}
  async infer(input:ProviderInferenceInput):Promise<Response>{
    const key=this.key??await this.store.read();
    if(!key)return Response.json({error:{code:'model_anthropic_not_configured'}},{status:401});
    if(!this.models.has(input.modelId))await this.inspect();
    if(!this.models.has(input.modelId))return Response.json({error:{code:'model_not_available'}},{status:404});
    try{
      const response=await this.fetch(BASE+'/messages',{method:'POST',headers:this.headers(key),body:JSON.stringify({...input.body,model:input.modelId}),redirect:'error',signal:AbortSignal.any([input.signal,this.lifetime.signal])});
      if(response.ok)return response;
      await response.body?.cancel();
      return Response.json({error:{code:response.status===401?'model_anthropic_authentication_failed':response.status===429?'model_anthropic_rate_limited':'model_anthropic_upstream_failed'}},{status:response.status});
    }catch{return Response.json({error:{code:'model_anthropic_network_failed'}},{status:502});}
  }
  async close(){this.lifetime.abort();}
}
