import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Input, Select, Space, Spin, Tag, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { agentAssetsApi, type SkillSummary } from '../api/agent-assets-api';
import { useAppShell } from '../../../app/AppShellContext';
import { SkillDetailDrawer } from '../components/SkillDetailDrawer';
import { SkillActionDrawer } from '../components/SkillActionDrawer';
import { filterSkills, type SkillAction } from '../skill-presentation';
import '../skills.css';

export function SkillsPage() {
  const { workspaceId } = useAppShell();
  return <WorkspaceSkills key={workspaceId} />;
}
function WorkspaceSkills() {
  const { workspace, setBreadcrumbParts } = useAppShell();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [selected, setSelected] = useState<SkillSummary | null>(null);
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
  const clear = () => { setQuery(''); setSource(''); };
  return <>
    <section className="page-header skills-page-header"><div><Typography.Title level={2}>技能</Typography.Title><p className="page-copy">了解和维护当前工作空间的工作方法。</p></div><Space><Button icon={<ReloadOutlined />} aria-label="刷新技能" loading={loading} onClick={() => setRetry(retry + 1)} /><Button id="skills-add" type="primary" icon={<PlusOutlined />} disabled={!workspace?.rootPath} onClick={() => openAction('add')}>添加技能</Button></Space></section>
    <div className="skills-toolbar"><Input id="skills-search" allowClear prefix={<SearchOutlined />} aria-label="搜索技能" placeholder="搜索名称、标识或用途…" value={query} onChange={(event) => setQuery(event.target.value)} /><Select aria-label="来源筛选" value={source} onChange={setSource} options={[{ label: '全部来源', value: '' }, ...[...new Set(skills.map((skill) => skill.sourceLabel))].sort().map((label) => ({ label, value: label }))]} /><span>{filtered.length} / {skills.length} 个技能</span></div>
    {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => setRetry(retry + 1)}>重试</Button>} /> : loading ? <div className="skills-loading"><Spin /><p>正在读取技能…</p></div> : <section id="skills-list" aria-label="技能列表">
      <div className="skills-list-head"><span>技能 / 用途</span><span className="skills-source-label">来源</span><span>启用情况</span><span /></div>
      {filtered.length ? filtered.map((skill) => <button key={skill.id} className="skills-row" data-skill-id={skill.id} onClick={() => setSelected(skill)}><div><strong>{skill.title}</strong>{skill.title !== skill.id && <small>{skill.id}</small>}<p>{skill.description || '暂无用途说明'}</p>{skill.contentIssue && <span className="skills-issue">{skill.contentIssue}</span>}</div><span className="skills-source-label">{skill.sourceLabel}</span><Tag color={skill.enabled ? 'success' : 'default'}>{skill.enabled ? '已启用' : '已停用'}</Tag><RightOutlined /></button>) : <Empty className="skills-empty" description={skills.length ? '没有找到匹配的技能' : '当前工作空间还没有登记技能'}>{skills.length ? <Button onClick={clear}>清除筛选</Button> : <Button disabled={!workspace?.rootPath} onClick={() => openAction('add')}>添加技能</Button>}</Empty>}
    </section>}
    {selected ? <SkillDetailDrawer key={selected.id} skill={selected} onClose={() => setSelected(null)} onAction={openAction}>
      {renderAction()}
    </SkillDetailDrawer> : renderAction()}
  </>;
  function renderAction() {
    if (!action) return null;
    const draftKey = action.skill?.id || '$new';
    return <SkillActionDrawer open={actionOpen} action={action.kind} skill={action.skill} root={workspace?.rootPath || ''}
      drafts={drafts[draftKey] || {}} onDraftChange={(kind, input) => setDrafts((current) => ({ ...current, [draftKey]: { ...current[draftKey], [kind]: input } }))}
      onClose={() => setActionOpen(false)} onClosed={() => { setAction(null); requestAnimationFrame(() => actionOrigin.current?.focus()); }} />;
  }
}
