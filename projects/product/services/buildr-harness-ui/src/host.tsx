import {createContext,useContext,type ReactNode} from 'react';
import type {ConversationView,ConversationTaskLink} from './features/agent-conversations/types.ts';
export type HarnessFileContent={kind:string;content:string;message?:string;truncated:boolean};
export interface HarnessUiHost {
  /** Directory-only products require an explicit registered starting scope. */
  scopeRequired?:boolean;
  taskLinks?(props:{scopeId:string;taskLinks:ConversationTaskLink[];onAssign:(links:ConversationTaskLink[])=>Promise<boolean>;onNavigate?:()=>void}):ReactNode;
  participation?(props:{workspaceId:string;conversationId?:string;runId?:string}):ReactNode;
  readFile?(conversation:ConversationView,path:string,signal:AbortSignal):Promise<HarnessFileContent>;
  openFile?(conversation:ConversationView,path:string,literal:boolean):Promise<void>;
  resolveWorkObjectLink?(reference:string,pathname?:string|null):{href:string;title:string}|null;
}
const Host=createContext<HarnessUiHost>({});
export const useHarnessUiHost=()=>useContext(Host);
export function HarnessUiHostProvider({host,children}:{host:HarnessUiHost;children:ReactNode}){return <Host.Provider value={host}>{children}</Host.Provider>;}
