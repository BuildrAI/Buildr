import {ModelAccessError,type ModelOffering,type ModelPreference} from './contracts.ts';

export function effectiveModel(model:ModelOffering,preference:ModelPreference|undefined):ModelOffering {
  const reported=model.reportedContextWindow??model.contextWindow;
  const requested=preference?.contextWindow;
  return {...model,enabled:preference?.enabled??false,reportedContextWindow:reported,
    contextWindowOverride:requested,contextWindow:requested===undefined?model.contextWindow:Math.min(requested,model.contextWindow??requested)};
}
export function selectedOffering(model:ModelOffering,tierId?:string):ModelOffering {
  const id=tierId??model.defaultServiceTier;
  const tier=id?model.serviceTiers?.find(tier=>tier.id===id):undefined;
  if(id&&!tier)throw new ModelAccessError('model_tier_unavailable','所选模型服务档位不存在，请重新选择。');
  if(!tier)return model;
  return {...model,defaultServiceTier:id,reasoningEfforts:tier.reasoningEfforts,defaultReasoningEffort:tier.defaultReasoningEffort,
    contextWindow:(tier.contextWindow??model.contextWindow)===undefined?model.contextWindowOverride:Math.min(model.contextWindowOverride??tier.contextWindow??model.contextWindow!,tier.contextWindow??model.reportedContextWindow??model.contextWindow!)};
}
export function modelConfiguration(model:ModelOffering,tier?:string):string {
  const selected=selectedOffering(model,tier);
  return JSON.stringify([selected.defaultServiceTier??'',selected.contextWindow??null]);
}
