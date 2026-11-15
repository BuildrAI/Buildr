import {ProgrammaticCredentials} from '../persistence/programmatic-credentials.ts';
import {HostContext} from './host-context.ts';
import type {AgentServiceOptions} from '../contracts.ts';
import {executionScopeKey} from '../execution-contracts.ts';
import type {ExecutionScopeRef} from '../execution-contracts.ts';
import {AgentServiceError} from '../domain/agent-state.ts';

/** Shared service is the sole product writer; host HTTP adapters have no DB handle. */
export class ProgrammaticAccess {
  private readonly store:ProgrammaticCredentials;
  private readonly host:HostContext;
  constructor(options:AgentServiceOptions){this.store=new ProgrammaticCredentials(options.dataRoot);this.host=new HostContext(options);}
  private async registered(raw:unknown):Promise<ExecutionScopeRef[]> {
    if(!raw||typeof raw!=='object')throw new AgentServiceError('programmatic_input_invalid','凭据参数无效。');
    const value=raw as {workspaceIds?:unknown;executionScopes?:unknown};
    const refs=value.executionScopes??(Array.isArray(value.workspaceIds)?value.workspaceIds.map(id=>({sourceId:'buildr',id})):undefined);
    if(!Array.isArray(refs)||refs.length>100)throw new AgentServiceError('programmatic_input_invalid','请选择有限的已登记范围。');
    for(const ref of refs){
      if(!ref||typeof ref!=='object'||typeof ref.sourceId!=='string'||typeof ref.id!=='string')throw new AgentServiceError('programmatic_input_invalid','执行范围身份无效。');
      await this.host.resolve(executionScopeKey(ref));
    }
    return refs;
  }
  list(){return this.store.list();}
  async create(raw:unknown){return this.store.create(raw,await this.registered(raw));}
  async update(id:string,revision:unknown,raw:unknown){return this.store.update(id,revision,raw,await this.registered(raw));}
  regenerate(id:string,revision:unknown){return this.store.regenerate(id,revision);}
  revoke(id:string,revision:unknown){return this.store.revoke(id,revision);}
  updateFullAccess(id:string,revision:unknown,value:unknown){return this.store.updateFullAccess(id,revision,value);}
  authenticate(value:unknown){return this.store.authenticate(value);}
}

export type ProgrammaticAccessPort=Pick<ProgrammaticAccess,keyof ProgrammaticAccess>;
export function createProgrammaticAccess(options:AgentServiceOptions):ProgrammaticAccessPort{return new ProgrammaticAccess(options);}
