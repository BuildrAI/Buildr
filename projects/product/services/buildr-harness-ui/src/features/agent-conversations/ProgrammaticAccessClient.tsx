import {createContext, useContext, type ReactNode} from 'react';
import {programmaticAccessApi, type ProgrammaticAccessClient} from './api/programmatic-access-api.ts';

const Client = createContext<ProgrammaticAccessClient>(programmaticAccessApi);
/** The product owns authentication/transport; settings retain their one implementation. */
export function ProgrammaticAccessClientProvider({client, children}: {client: ProgrammaticAccessClient; children: ReactNode}) {
  return <Client.Provider value={client}>{children}</Client.Provider>;
}
export function useProgrammaticAccessClient() {return useContext(Client);}
