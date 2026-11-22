import { createContext } from 'react';

export const WorkspaceViewActiveContext = createContext(true);
/** Temporary panes remain operable; consumers may suppress automatic focus or routing. */
export const WorkspaceViewTransientContext = createContext(false);
