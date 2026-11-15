import {createContext,useContext,type ReactNode} from 'react';
import type {ConversationView} from './features/agent-conversations/types.ts';
export type HarnessFileContent={kind:string;content:string;message?:string;truncated:boolean};
export interface HarnessDirectoryFiles{scopeRequired:true;readFile?(conversation:ConversationView,path:string,signal:AbortSignal):Promise<HarnessFileContent>;openFile?(conversation:ConversationView,path:string,literal:boolean):Promise<void>}
const Files=createContext<HarnessDirectoryFiles>({scopeRequired:true});
export const useHarnessDirectoryFiles=()=>useContext(Files);
export function HarnessDirectoryFilesProvider({host,children}:{host:HarnessDirectoryFiles;children:ReactNode}){return <Files.Provider value={host}>{children}</Files.Provider>;}
