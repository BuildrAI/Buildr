import type { ReactNode, MouseEventHandler } from 'react';
import { NavLink } from 'react-router-dom';
export function AppNavigationItem({to,state,path,name,label,icon,active,onClick,hasChanges}:{to:string;state?:unknown;path:string;name:string;label:string;icon:ReactNode;active:boolean;hasChanges?:boolean;onClick?:MouseEventHandler<HTMLAnchorElement>}) {
  return <NavLink to={to} state={state} data-nav={name} data-workspace-route={path} data-has-changes={hasChanges || undefined} title={label + (hasChanges ? ' · 当前工作空间有未提交变更，包含其他代码库或工作树' : '')} aria-label={label} aria-description={hasChanges ? '当前工作空间有未提交变更，包含其他代码库或工作树' : undefined} className={`shell-nav-item${active ? ' active' : ''}`} onClick={onClick}>{hasChanges === undefined ? icon : <span className="shell-nav-status-icon">{icon}{hasChanges && <i className="shell-nav-change-dot" aria-hidden="true" />}</span>}<span>{label}</span></NavLink>;
}
