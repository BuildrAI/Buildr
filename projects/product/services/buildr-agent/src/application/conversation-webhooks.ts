import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { ServiceEvent, ConversationView } from '../contracts.ts';
import { WebhookJournal } from '../persistence/webhook-journal.ts';
import { conversationNotifications, type NotificationSnapshot } from '../domain/conversation-notifications.ts';

type Options = { root?:string; retryBaseMs?:number; now?:()=>number };
/** Durable at-least-once notifications; retries repeat only an immutable event, never agent work. */
export class ConversationWebhooks {
  private readonly owner=randomUUID();
  private readonly active=new Set<AbortController>();
  private readonly journal:WebhookJournal;
  private readonly target:string;
  private timer?:ReturnType<typeof setTimeout>;
  private closed=false;
  private readonly clock:()=>number;
  private readonly url:string;
  private readonly secret:string;
  private readonly transport:typeof fetch;
  private readonly options:Options;
  private readonly sourceUrl:string;
  private storageFailed=false;
  private recoveryPage?: (after?:string)=>ConversationView[];
  private recoveryTimer?:ReturnType<typeof setTimeout>;
  private constructor(url:string,secret:string,transport:typeof fetch,options:Options,sourceUrl:string) {
    this.url=url;this.secret=secret;this.transport=transport;this.options=options;this.sourceUrl=sourceUrl;
    this.clock=options.now??Date.now;
    this.target=createHash('sha256').update(JSON.stringify([url,secret])).digest('hex');
    this.journal=new WebhookJournal(options.root);
    this.schedule(0);
  }
  static configure(environment:NodeJS.ProcessEnv,transport:typeof fetch=fetch,options:Options={}):ConversationWebhooks|undefined {
    const url=environment.BUILDR_AGENT_WEBHOOK_URL,secret=environment.BUILDR_AGENT_WEBHOOK_SECRET;
    if (!url||!secret||!secret.trim()||/[^\x21-\x7e]/.test(secret)) return;
    let parsed:URL;
    try {parsed=new URL(url);}catch{return;}
    if (!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password) return;
    try{return new ConversationWebhooks(parsed.href,secret,transport,options,url);}catch{console.warn('[agent_webhook_storage_unavailable] 通知存储不可用，未启用投递。');return;}
  }
  publish(event:Omit<ServiceEvent,'cursor'|'generation'>):void {
    if(this.closed||event.type!=='conversation'||!event.payload.conversation)return;
    try {this.project(event.payload.conversation);this.drain();}catch{this.storageFailure();}
  }
  private project(view:ConversationView):void {
    this.journal.project<NotificationSnapshot>(this.target,view.workspaceId,view.id,prior=>{
      const next=conversationNotifications(view,{name:'Buildr',id:this.journal.instanceId},hostname(),prior);
      next.events=next.events.map(event=>JSON.parse(JSON.stringify(event,(_key,value:unknown)=>typeof value==='string'?value.split(this.secret).join('[REDACTED]').split(this.url).join('[REDACTED]').split(this.sourceUrl).join('[REDACTED]'):value)));
      return next;
    });
  }
  /** Startup recovery is paged and only reads the committed local conversation authority. */
  async recover(page:(after?:string)=>ConversationView[]):Promise<void> {
    this.recoveryPage=page;
    let after:string|undefined;
    try {while(!this.closed){
      const views=page(after);if(!views.length)return;
      for(const view of views){if(this.closed)return;this.project(view);}
      after=views.at(-1)!.id;this.drain();
      await new Promise<void>(resolve=>setImmediate(resolve));
    }}catch{this.storageFailure();}
  }
  replay(scope:string,id:string,eventId:string):{eventId:string;queued:true} {
    const result=this.journal.replay(this.target,scope,id,eventId);this.drain();return result;
  }
  private schedule(delay:number):void {
    if(this.closed)return;
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>{this.timer=undefined;this.drain();},delay);this.timer.unref();
  }
  private storageFailure():void {
    if(this.closed)return;
    if(!this.storageFailed)console.warn('[agent_webhook_storage_unavailable] 通知存储暂不可用，保留既有记录并等待恢复。');
    this.storageFailed=true;
    if(this.recoveryPage&&!this.recoveryTimer){
      this.recoveryTimer=setTimeout(()=>{this.recoveryTimer=undefined;void this.recover(this.recoveryPage!);},1000);this.recoveryTimer.unref();
    }
  }
  private drain():void {
    if(this.closed)return;
    try{this.dispatch();this.storageFailed=false;}catch{this.storageFailure();this.schedule(1000);}
  }
  private dispatch():void {
    if(this.closed)return;
    clearTimeout(this.timer);this.timer=undefined;
    while(this.active.size<16){
      const item=this.journal.claim(this.target,this.owner,this.clock());if(!item)break;
      const controller=new AbortController();this.active.add(controller);
      const timeout=setTimeout(()=>controller.abort(),5000);timeout.unref();
      void(async()=>{
        let success=false;
        try {const response=await this.transport(this.url,{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${this.secret}`},body:item.body,signal:controller.signal});success=response.ok;await response.body?.cancel();}catch{/* Retry the same event, including uncertain delivery. */}
        finally {
          clearTimeout(timeout);this.active.delete(controller);
          if(!this.closed){
            try {const delay=Math.min(300000,(this.options.retryBaseMs??1000)*2**Math.min(item.attempts-1,20));this.journal.settle(item,success,this.clock()+delay);this.drain();}catch{this.schedule(1000);}
          }
        }
      })();
    }
    const due=this.journal.next(this.target,this.clock());
    // Poll also discovers events published by a retained process sharing this instance journal.
    this.schedule(due===undefined?30000:this.active.size>=16?1000:Math.max(1,Math.min(30000,due-this.clock())));
  }
  close():void {
    if(this.closed)return;this.closed=true;clearTimeout(this.timer);clearTimeout(this.recoveryTimer);
    for(const controller of this.active)controller.abort();
    try{this.journal.close(this.owner);}catch{console.warn('[agent_webhook_storage_unavailable] 通知租约未能释放，恢复后按租约期限核对。');}
  }
}
