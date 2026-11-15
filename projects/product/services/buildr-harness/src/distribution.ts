export interface DistributionComponent {name:string;version:string;license:string}
export interface DistributionDecision {name:string;version:string;disposition:'approved'|'restricted'|'denied';authority:{name:string;source:string};reason:string}
/** Artifact-specific publication check; it never grants model/subscription rights. */
export function checkDistribution(components:DistributionComponent[],decisions:DistributionDecision[]){
  const findings=components.flatMap(component=>{
    const matching=decisions.filter(value=>value.name===component.name&&value.version===component.version);
    const decision=matching.length===1?matching[0]:undefined;
    if(!decision||!decision.authority?.name?.trim()||!decision.authority.source?.trim()||!decision.reason?.trim())return [{...component,code:'decision-missing',reason:'缺少准确版本的负责人决定或来源。'}];
    return decision.disposition==='approved'?[]:[{...component,code:['restricted','denied'].includes(decision.disposition)?decision.disposition:'decision-invalid',reason:decision.reason}];
  });
  if(!components.length)findings.push({name:'distribution',version:'unknown',license:'UNKNOWN',code:'evidence-missing',reason:'没有实际发行物的依赖证据。'});
  return {status:findings.length?'blocked' as const:'eligible' as const,publicationApproved:findings.length===0,findings};
}
