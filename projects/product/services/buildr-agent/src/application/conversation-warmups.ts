import type {AgentRuntime,ContextRef} from '../contracts.ts';

export const CONNECTION_IDLE_MS = 30 * 60_000;
export const QODER_IDLE_REUSE_MS = 5 * 60_000;
export const QODER_PREPARATION_IDLE_MS = 60_000;
export type PreparedSource = {runtime:AgentRuntime;model:string;leaseIdentity?:string;contextRef?:ContextRef};
type Entry = {key:string;connectionId:string;preparationId?:string;completedAt?:number;work:Promise<PreparedSource>;closing?:Promise<void>};
/** One speculative owner per exact model binding; adoption transfers ownership to the conversation. */
export class ConversationWarmups {
  private readonly entries = new Map<string,Entry>();
  private stopped=false;
  private qoderSlot?:string;
  private readonly claimed = new Set<string>();
  private readonly release:(source:PreparedSource)=>Promise<void>;
  private readonly now:()=>number;
  constructor(release:(source:PreparedSource)=>Promise<void>,now:()=>number) {this.release=release;this.now=now;}
  get size() { return this.entries.size; }
  unclaim(slot:string) {this.claimed.delete(slot);}
  private closeEntry(slot:string,entry:Entry):Promise<void> {
    if(!entry.closing)entry.closing=(async()=>{
      const source=await entry.work.catch(()=>undefined);if(source)await this.release(source);
      if(this.entries.get(slot)===entry)this.entries.delete(slot);
    })();
    return entry.closing;
  }
  async prepare(slot:string,key:string,connectionId:string,create:()=>Promise<PreparedSource>,preparationId?:string):Promise<boolean> {
    if(connectionId==='qoder'){
      this.qoderSlot=slot;
      await Promise.all([...this.entries].filter(([id,entry])=>id!==slot&&entry.connectionId==='qoder').map(([id,entry])=>this.closeEntry(id,entry)));
      if(this.qoderSlot!==slot)return false;
    }
    for(;;){
      if(this.stopped)throw new Error('agent_service_closing');
      if(this.claimed.has(slot))return false;
      const existing=this.entries.get(slot);if(!existing)break;
      if(existing.key===key&&!existing.closing){existing.preparationId=preparationId;await existing.work;return true;}
      await this.closeEntry(slot,existing);
    }
    if(this.entries.size>=8)throw new Error('agent_preparation_capacity');
    const entry:Entry={key,connectionId,preparationId,work:undefined!};
    entry.work=Promise.resolve().then(create).then(source=>{entry.completedAt=this.now();return source;}).catch(error=>{if(this.entries.get(slot)===entry)this.entries.delete(slot);throw error;});
    this.entries.set(slot,entry);await entry.work;return true;
  }
  async take(slot:string,key:string):Promise<PreparedSource|undefined> {
    for(;;){
      const entry=this.entries.get(slot);
      if(!entry){this.claimed.add(slot);return;}
      if(entry.key!==key||entry.closing){await this.closeEntry(slot,entry);continue;}
      this.entries.delete(slot);this.claimed.add(slot);
      return await entry.work.catch(()=>undefined);
    }
  }
  async discard(slot:string,key:string,preparationId?:string):Promise<void> {
    const entry=this.entries.get(slot);if(entry?.key===key&&entry.preparationId===preparationId)await this.closeEntry(slot,entry);
  }
  async shutdown():Promise<void> {this.stopped=true;await this.close();}
  async close(connectionId?:string,idleBefore?:number):Promise<void> {
    await Promise.all([...this.entries].map(async([slot,entry])=>{
      if(connectionId&&entry.connectionId!==connectionId)return;
      const cutoff=idleBefore===undefined?undefined:entry.connectionId==='qoder'?Math.max(idleBefore,this.now()-QODER_PREPARATION_IDLE_MS):idleBefore;
      if(cutoff!==undefined&&(entry.completedAt===undefined||entry.completedAt>cutoff))return;
      await this.closeEntry(slot,entry);
    }));
  }
}
