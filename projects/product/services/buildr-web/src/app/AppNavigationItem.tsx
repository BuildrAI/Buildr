import type { ReactNode, MouseEventHandler } from 'react';
import { NavLink } from 'react-router-dom';
export function AppNavigationItem({to,state,path,name,label,icon,active,onClick}:{to:string;state?:unknown;path:string;name:string;label:string;icon:ReactNode;active:boolean;onClick?:MouseEventHandler<HTMLAnchorElement>}) {
  return <NavLink to={to} state={state} data-nav={name} data-workspace-route={path} title={label} aria-label={label} className={`shell-nav-item${active ? ' active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></NavLink>;
}
