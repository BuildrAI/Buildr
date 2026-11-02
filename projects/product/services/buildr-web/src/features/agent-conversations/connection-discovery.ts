import type { ConnectionView } from './types';

export type ConnectionDiscoveryState = { ready:boolean; loading:boolean; error:string };

/** One discovery request at a time; backend handoffs never erase a good snapshot. */
export class ConnectionDiscovery {
  private stopped=false;
  private pending?:Promise<void>;
  private timer?:ReturnType<typeof setTimeout>;
  private failures=0;
  private state:ConnectionDiscoveryState={ready:false,loading:false,error:''};
  private read:()=>Promise<ConnectionView[]>;
  private publish:(rows:ConnectionView[])=>void;
  private status:(value:ConnectionDiscoveryState)=>void;
  private retryDelay:(failures:number)=>number;
  constructor(read:()=>Promise<ConnectionView[]>,publish:(rows:ConnectionView[])=>void,
    status:(value:ConnectionDiscoveryState)=>void,retryDelay=(failures:number)=>Math.min(5000,1000*failures)) {
    this.read=read;this.publish=publish;this.status=status;this.retryDelay=retryDelay;
  }
  start(){this.stopped=false;}
  refresh():Promise<void>{
    if(this.stopped)return Promise.resolve();
    if(this.pending)return this.pending;
    if(this.timer)clearTimeout(this.timer);this.timer=undefined;
    this.status({...this.state,loading:true});
    const work=Promise.resolve().then(this.read).then(rows=>{
      if(this.stopped)return;
      this.failures=0;this.publish(rows);this.state={ready:true,loading:false,error:''};this.status(this.state);
    },()=>{
      if(this.stopped)return;
      this.failures++;
      this.state={...this.state,loading:false,error:this.failures>=3?'智能体列表暂未更新，正在自动恢复连接。':''};this.status(this.state);
      this.timer=setTimeout(()=>{void this.refresh();},this.retryDelay(this.failures));
    }).finally(()=>{if(this.pending===work)this.pending=undefined;});
    this.pending=work;return work;
  }
  stop(){this.stopped=true;if(this.timer)clearTimeout(this.timer);this.timer=undefined;}
}
