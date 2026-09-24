import { ResourceActions } from '../../workbench/components/ResourceActions';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Input, Tag } from 'antd';
import { FileTextOutlined, RightOutlined } from '@ant-design/icons';
import { WorkspaceStage } from '../../../components/WorkspaceStage';
import { ResourceDocumentPane } from '../../../components/ResourceDocumentPane';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { agentAssetsApi, type SkillDetail, type SkillSummary } from '../api/agent-assets-api';
import type { SkillAction } from '../skill-presentation';

type SkillHomeProps = { skill: SkillSummary; onAction: (action: SkillAction, skill: SkillSummary) => void; onRemove?: () => void; children?: ReactNode };
export function SkillHome(props: SkillHomeProps) {
  return <SkillHomeContent key={props.skill.id} {...props} />;
}
function SkillHomeContent({ skill, onAction, onRemove, children }: SkillHomeProps) {
  const tabs = useWorkspacePageTabs();
  const { workspaceId } = useAppShell();
  const [detail, setDetail] = useState<SkillDetail | null>(null), [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<string[]>([]), [activeFile, setActiveFile] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void agentAssetsApi.skillDetail(skill.id, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setDetail(data); }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [skill.id]);
  const load = useCallback(async (file: string) => { const data = await agentAssetsApi.skillFile(skill.id, file); return { path: data.path, exists: true, content: data.format === 'text' ? data.content : data.readingContent, format: data.format }; }, [skill.id]);
  const open = (file: string) => { setFiles(current => current.includes(file) ? current : [...current, file]); setActiveFile(file); };
  const close = (file: string) => setFiles(current => { const next = current.filter(f => f !== file); setActiveFile(active => active === file ? next.at(-1) || null : active); return next; });
  const documents = detail?.files.filter(f => f.path !== 'SKILL.md') || [];
  const matchingFiles = documents.filter(file => file.path.toLowerCase().includes(query.trim().toLowerCase()));
  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close} objectTabs={files.map(file => ({ key: file, kind: 'doc', title: file }))} activeObject={activeFile} onActivateObject={setActiveFile} onCloseObject={close}
    objectContent={files.map(file => <div key={file} hidden={file !== activeFile}><ResourceDocumentPane file={file} load={load} onOpen={open} /></div>)}>
    <div className="resource-home">
      <header className="resource-home-head"><div><p className="resource-eyebrow">技能 <span> / {skill.id}</span></p><h1>{skill.title}</h1><p>{skill.description || '尚未填写说明。'}</p><div className="resource-home-meta"><span>{skill.sourceLabel}</span><Tag color={skill.enabled ? 'success' : 'default'}>{skill.enabled ? '已启用' : '已停用'}</Tag></div></div><ResourceActions resource={{ kind: "skill", key: "skill:" + skill.id, label: skill.title, href: workspaceHref(workspaceId, "/skills/" + encodeURIComponent(skill.id)) }} /><Button onClick={onRemove}>移除</Button><Button onClick={() => onAction('adjust', skill)}>编辑技能</Button></header>
      {error && <Alert type="error" message={error} />}
      {skill.contentIssue && <Alert type="warning" message={skill.contentIssue} />}
      <details className="resource-section skill-reference-files">
        <summary>其他文件 <span>{detail ? documents.length : '…'}</span></summary>
        <p className="page-copy">需要具体示例、参考资料或工具时，再打开相应文件。</p>
        <Input placeholder="查找文件路径" aria-label="查找技能文件" allowClear value={query} onChange={event => setQuery(event.target.value)} />
        <div className="skill-reference-list">
          {matchingFiles.map(file => <button key={file.path} type="button" disabled={!file.readable} className="resource-document-row" onClick={() => open(file.path)}><span className="resource-row-icon"><FileTextOutlined /></span><span className="resource-row-text"><strong>{file.path}</strong><small>{file.readable ? '参考材料' : file.reason}</small></span><RightOutlined /></button>)}
          {detail && !matchingFiles.length && <p className="page-copy">{documents.length ? '没有匹配的文件。' : '暂无其他文件。'}</p>}
        </div>
      </details>
      <section className="resource-section skill-primary-document" aria-label="技能正文">
        <ResourceDocumentPane file="SKILL.md" load={load} onOpen={open} />
      </section>
      <section className="resource-section"><div className="resource-section-head"><h2>维护信息</h2><Button size="small" disabled={skill.required} onClick={() => onAction(skill.enabled ? 'disable' : 'enable', skill)}>{skill.enabled ? '停用技能' : '启用技能'}</Button></div><p className="page-copy">{skill.required ? '此技能是工作空间必需项。' : '启用情况由当前工作空间维护。'}修改内容时由智能体（Agent）核对权威源与归属。</p><code className="resource-path">{skill.sourcePath || '未登记本地源目录'}</code></section>
    </div>{children}
  </WorkspaceStage>;
}
