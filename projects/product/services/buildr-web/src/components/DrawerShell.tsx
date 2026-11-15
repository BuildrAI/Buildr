import {useContext} from 'react';
import {WorkspaceViewActiveContext} from '../app/pageTabs';
import {DrawerShell as SharedDrawerShell,type DrawerShellProps} from '@buildr-ai/buildr-harness-ui/components/DrawerShell';
export function DrawerShell(props:DrawerShellProps){const active=useContext(WorkspaceViewActiveContext);return <SharedDrawerShell {...props} active={active}/>;}
