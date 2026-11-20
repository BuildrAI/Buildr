import {createContext,useContext,type ReactNode} from 'react';
import type {ConversationView} from './features/agent-conversations/types.ts';
export type HarnessFileContent={kind:string;content:string;path?:string;htmlUrl?:string;message?:string;truncated:boolean};
export interface HarnessDirectoryFiles{scopeRequired?:boolean;chooseWorkspace?():void;readFile?(conversation:ConversationView,path:string,signal:AbortSignal):Promise<HarnessFileContent>;openFile?(conversation:ConversationView,path:string,literal:boolean,signal?:AbortSignal):Promise<boolean|void>}
const Files=createContext<HarnessDirectoryFiles>({});
export const useHarnessDirectoryFiles=()=>useContext(Files);
export function HarnessDirectoryFilesProvider({host,children}:{host:HarnessDirectoryFiles;children:ReactNode}){return <Files.Provider value={host}>{children}</Files.Provider>;}
