import {previewModelContext} from './context-window.ts';
import type {ModelAccount} from './types.ts';

export interface ModelPreferenceChange {sourceId:string;modelId:string;enabled?:boolean;contextWindow?:number|null;}
type PreferenceRow = Omit<ModelPreferenceChange,'sourceId'|'modelId'> & {id:string};
type Result = {account:ModelAccount;sentRevision:string}|{failure:unknown;sentRevision:string};
interface Entry {observed:ModelAccount;result:Promise<Result>;}

/** Only successful writes in this queue can advance a queued click's observed version. */
export class ModelPreferenceQueue {
 private tail=Promise.resolve();
 private last=new Map<string,Entry>();
 get settled(){return this.tail;}

 enqueue(observed:ModelAccount,rows:PreferenceRow[],save:(account:ModelAccount,rows:PreferenceRow[])=>Promise<ModelAccount>):Promise<Result>{
  const previous=this.last.get(observed.id);
  const result=this.tail.then(async():Promise<Result>=>{
   let account=observed;
   try{
    if(previous){
     const prior=await previous.result;
     if(previous.observed.revision===observed.revision||prior.sentRevision===observed.revision){
      if('failure' in prior)return prior;
      account=prior.account;
     }
    }
    return {account:await save(account,rows),sentRevision:account.revision};
   }catch(failure){return {failure,sentRevision:account.revision};}
  }).finally(()=>{if(this.last.get(observed.id)?.result===result)this.last.delete(observed.id);});
  this.last.set(observed.id,{observed,result});
  this.tail=result.then(()=>{});
  return result;
 }
}

export function previewModelPreferences(accounts:ModelAccount[],batches:ModelPreferenceChange[][]):ModelAccount[]{
 if(!batches.length)return accounts;
 const pending=new Map<string,Map<string,ModelPreferenceChange[]>>();
 for(const batch of batches)for(const change of batch){
  const models=pending.get(change.sourceId)??new Map<string,ModelPreferenceChange[]>();
  const changes=models.get(change.modelId)??[];
  changes.push(change);models.set(change.modelId,changes);pending.set(change.sourceId,models);
 }
 return accounts.map(account=>{
  const models=pending.get(account.id);
  if(!models)return account;
  return {...account,models:account.models.map(model=>(models.get(model.id)??[]).reduce((current,{enabled,contextWindow})=>({
   ...current,enabled:enabled??current.enabled,...previewModelContext(current,contextWindow),
  }),model))};
 });
}
