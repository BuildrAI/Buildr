import type { ParticipationSourceRequest, ParticipationSourceResult } from '@buildr-ai/buildr-agent';
import type { AgentAssetSourceQuery } from '../../agent-assets/source/module.ts';
import { observeParticipationCli } from './participation-cli-source.ts';

/** Host-owned asset interpretation; the execution service never imports these business readers. */
export function createParticipationSourceObserver(options:{
  root(ref:ParticipationSourceRequest['ref']):string;
  query:AgentAssetSourceQuery;
  identity():unknown;
}):(input:ParticipationSourceRequest)=>Promise<ParticipationSourceResult> {
  return async ({ref,observations,discover,provider})=>{
    const root=options.root(ref);
    if(!Array.isArray(observations)||observations.length>32)throw new Error('participation-source-limit');
    const supported=observations.filter(item=>item.path&&['rule','skill','script','capability'].includes(item.kind));
    const result=discover?options.query.discover(root,provider??''):options.query.inspect(root,{schemaVersion:'buildr.agent-asset-source-observations/v1',mode:'metadata',observations:supported.map(item=>({id:item.id,type:'file',locator:{path:item.path}}))},{timeoutMs:250});
    const sources:ParticipationSourceResult['sources']=[];
    for(const item of result.items){
      if(item.status!=='detected')continue;
      for(const object of item.objects){
        if(!['rule','skill','capability'].includes(object.kind))continue;
        const requested=supported.find(observation=>observation.id===item.id);
        const offered=object.evidence.find(proof=>['buildr.skill-projection/v2','registered-source','registered-contract','buildr:required-template'].includes(proof.authority)&&proof.digest)?.digest;
        sources.push({observationId:item.id,identity:object.identity,name:String(object.selector.skillId??object.selector.relativePath??object.kind),kind:requested?.kind==='script'?'script':object.kind as 'rule'|'skill'|'capability',providedBy:object.providedBy==='buildr'||object.providedBy==='workspace'||object.providedBy==='external'?object.providedBy:'unknown',managedBy:object.managedBy,status:'confirmed',contentScope:item.mixed||object.selection?'fragment':'whole',...(object.observed.digest?{observedVersion:object.observed.digest}:{}),...(offered?{offeredVersion:offered}:{})});
      }
    }
    for(const item of observations.filter(value=>value.kind==='cli')){const source=observeParticipationCli(options.identity(),item.path);if(source){const category=item.name==='Buildr CLI 帮助'?'help':item.name==='Buildr CLI 版本'?'version':'invocation';sources.push({...source,identity:source.identity+':'+category,name:category==='help'?'Buildr CLI 帮助':category==='version'?'Buildr CLI 版本':source.name,observationId:item.id});}}
    return {version:1,sources,coverage:'partial',gaps:[...(discover?['discovery-partial']:[]),...(supported.length!==observations.filter(item=>item.kind!=='cli').length?['unsupported-source-form']:[]),'implicit-consumption-unavailable']};
  };
}
