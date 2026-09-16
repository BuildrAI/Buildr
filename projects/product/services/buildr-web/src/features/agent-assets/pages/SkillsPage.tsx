import { ResourceDirectory } from '../../../components/ResourceDirectory';
import { useNavigate, useParams } from 'react-router-dom';
import { workspaceHref } from '../../../lib/labels';
import { WorkspaceStage } from '../../../components/WorkspaceStage';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Select, Spin, Tag } from 'antd';
import { agentAssetsApi, type SkillSummary } from '../api/agent-assets-api';
import { useAppShell } from '../../../app/AppShellContext';
import { SkillHome } from '../components/SkillHome';
import { SkillActionDrawer } from '../components/SkillActionDrawer';
import { filterSkills, type SkillAction } from '../skill-presentation';
import '../skills.css';

export function SkillsPage({ previewId }: { previewId?: string }) {
  const { workspaceId } = useAppShell();
  return <WorkspaceSkills key={workspaceId} previewId={previewId} />;
}
function WorkspaceSkills({ previewId }: { previewId?: string }) {
  const navigate = useNavigate(), params = useParams();
  const skillId = previewId ?? params.skillId;
  const { workspaceId } = useAppShell();
  const tabs = useWorkspacePageTabs(workspaceId);
  const href = (id?: string) => workspaceHref(workspaceId, id ? `/skills/${encodeURIComponent(id)}` : '/skills');
  const { workspace, setBreadcrumbParts } = useAppShell();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const selected = skills.find(skill => skill.id === skillId) || null;
  useEffect(() => { tabs.register({ key: selected ? `skill:${selected.id}` : 'dir:skills', kind: selected ? 'svc' : 'dir', title: selected?.title || '技能目录', path: href(selected?.id) }); }, [selected?.id, selected?.title, workspaceId]);
  const actionOrigin = useRef<HTMLElement | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<SkillAction, string>>>>({});
  const [action, setAction] = useState<{ kind: SkillAction; skill?: SkillSummary } | null>(null);
  const openAction = (kind: SkillAction, skill?: SkillSummary) => {
    actionOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAction({ kind, skill }); setActionOpen(true);
  };
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void agentAssetsApi.skills({ signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setSkills(data.skills); })
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message || '技能读取失败'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => { setBreadcrumbParts([workspace?.name || '工作空间', '技能']); }, [workspace?.name, setBreadcrumbParts]);
  const filtered = filterSkills(skills, query, source);
  if (skillId) return selected ? <SkillHome skill={selected} onAction={openAction}>{renderAction()}</SkillHome> : loading ? <Spin /> : <Alert type="error" message={error || '技能不存在'} />;
  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close}>
    <ResourceDirectory onRefresh={() => setRetry(value => value + 1)} refreshing={loading} title="技能" noun="技能" description="组织可复用的工作方法，明确来源与启用情况。" data={filtered} total={skills.length} loading={loading} error={error}
      rowKey={s => s.id} name={s => s.title} summary={s => s.description} href={s => href(s.id)} onOpen={s => navigate(href(s.id))} onEdit={s => openAction('adjust', s)}
      query={query} onQueryChange={setQuery} searchText={s => `${s.title} ${s.id} ${s.description}`} searchId="skills-search" listId="skills-list" rowAttributes={s => ({ 'data-skill-id': s.id } as React.HTMLAttributes<HTMLTableRowElement>)}
      columns={[{ title: '来源', width: 170, dataIndex: 'sourceLabel' }, { title: '启用情况', width: 130, render: (_, s) => <Tag color={s.enabled ? 'success' : 'default'}>{s.enabled ? '已启用' : '已停用'}</Tag> }]}
      filters={<Select aria-label="来源筛选" value={source} onChange={setSource} options={[{ label: '全部来源', value: '' }, ...[...new Set(skills.map(s => s.sourceLabel))].sort().map(label => ({ label, value: label }))]} />}
      actions={<Button id="skills-add" type="primary" disabled={!workspace?.rootPath} onClick={() => openAction('add')}>新增技能</Button>} />
    {renderAction()}
  </WorkspaceStage>;
  function renderAction() {
    if (!action) return null;
    const draftKey = action.skill?.id || '$new';
    return <SkillActionDrawer open={actionOpen} action={action.kind} skill={action.skill} root={workspace?.rootPath || ''}
      drafts={drafts[draftKey] || {}} onDraftChange={(kind, input) => setDrafts((current) => ({ ...current, [draftKey]: { ...current[draftKey], [kind]: input } }))}
      onClose={() => setActionOpen(false)} onClosed={() => { setAction(null); requestAnimationFrame(() => actionOrigin.current?.focus()); }} />;
  }
}
