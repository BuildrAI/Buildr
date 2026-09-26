import { useContext, useEffect } from 'react';
import { Alert, Button, Spin } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppShell } from '../../../app/AppShellContext';
import { WorkspaceViewActiveContext, useWorkspacePageTabs } from '../../../app/pageTabs';
import { useResourcePreview } from '../../../app/resource-preview';
import { WorkspaceStage } from '../../../components/WorkspaceStage';
import { workspaceHref } from '../../../lib/labels';
import { WorkspaceComposition } from '../components/WorkspaceComposition';
import { emptyComposition } from '../components/composition-data';
import { useWorkspaceComposition } from '../components/useWorkspaceComposition';

export function WorkspaceOverviewPage() {
  const {workspaceId,workspace,setBreadcrumbParts}=useAppShell();
  const active=useContext(WorkspaceViewActiveContext),composition=useWorkspaceComposition(active);
  const location=useLocation(),navigate=useNavigate(),previews=useResourcePreview(),tabs=useWorkspacePageTabs();
  useEffect(()=>{setBreadcrumbParts([workspace?.name||'工作空间','总览']);},[workspace?.name,setBreadcrumbParts]);
  const open=(kind:'project'|'service'|'repository',id:string)=>{
    if(kind==='project'){
      const project=composition.data?.projects.find(item=>item.id===id);
      if(project)navigate(workspaceHref(workspaceId,`/projects/${encodeURIComponent(project.code)}?view=composition`),{state:{resourceViews:{items:[],active:null}}});
    }else previews?.open(location.pathname,workspaceHref(workspaceId,`/${kind==='service'?'services':'repositories'}/${encodeURIComponent(id)}`));
  };
  const warning=composition.error||composition.data?.diagnostics.map(d=>d.message).join('；');
  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close}>
    <header className="page-header"><div><p className="eyebrow">{workspace?.name||'工作空间'}</p><h1 id="workspace-overview-title">工作空间总览</h1><p className="page-copy">了解项目的用途、实现组成和代码位置。</p></div></header>
    {composition.loading&&!composition.data?<Spin aria-label="正在读取组成" />:composition.error&&!composition.data?<Alert type="warning" message="总览暂时无法读取" description={composition.error} action={<Button onClick={composition.reload}>重试</Button>} />:<WorkspaceComposition data={composition.data||emptyComposition} error={warning||undefined} onRetry={composition.reload} onOpen={open} />}
  </WorkspaceStage>;
}
