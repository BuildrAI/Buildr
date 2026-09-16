import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Tag } from 'antd';
import { FileTextOutlined, RightOutlined } from '@ant-design/icons';
import { WorkspaceStage } from '../../../components/WorkspaceStage';
import { ResourceDocumentPane } from '../../../components/ResourceDocumentPane';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { agentAssetsApi, type SkillDetail, type SkillSummary } from '../api/agent-assets-api';
import type { SkillAction } from '../skill-presentation';

export function SkillHome({ skill, onAction, children }: { skill: SkillSummary; onAction: (action: SkillAction, skill: SkillSummary) => void; children?: ReactNode }) {
  const tabs = useWorkspacePageTabs();
  const [detail, setDetail] = useState<SkillDetail | null>(null), [error, setError] = useState('');
  const [files, setFiles] = useState<string[]>([]), [activeFile, setActiveFile] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void agentAssetsApi.skillDetail(skill.id, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setDetail(data); }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [skill.id]);
  const load = useCallback(async (file: string) => { const data = await agentAssetsApi.skillFile(skill.id, file); return { path: data.path, exists: true, content: data.format === 'text' ? data.content : data.readingContent, format: data.format }; }, [skill.id]);
  const open = (file: string) => { setFiles(current => current.includes(file) ? current : [...current, file]); setActiveFile(file); };
  const close = (file: string) => setFiles(current => { const next = current.filter(f => f !== file); setActiveFile(active => active === file ? next.at(-1) || null : active); return next; });
  const documents = [{ path: 'SKILL.md', readable: true, reason: '' }, ...(detail?.files.filter(f => f.path !== 'SKILL.md') || [])];
  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close} objectTabs={files.map(file => ({ key: file, kind: 'doc', title: file }))} activeObject={activeFile} onActivateObject={setActiveFile} onCloseObject={close}
    objectContent={files.map(file => <div key={file} hidden={file !== activeFile}><ResourceDocumentPane file={file} load={load} onOpen={open} /></div>)}>
    <div className="resource-home">
      <header className="resource-home-head"><div><p className="resource-eyebrow">技能 <span> / {skill.id}</span></p><h1>{skill.title}</h1><p>{skill.description || '尚未填写说明。'}</p><div className="resource-home-meta"><span>{skill.sourceLabel}</span><Tag color={skill.enabled ? 'success' : 'default'}>{skill.enabled ? '已启用' : '已停用'}</Tag></div></div><Button onClick={() => onAction('adjust', skill)}>编辑技能</Button></header>
      {error && <Alert type="error" message={error} />}
      {skill.contentIssue && <Alert type="warning" message={skill.contentIssue} />}
      <section className="resource-section"><div className="resource-section-head"><h2>工作方法与参考材料 <span>{documents.length}</span></h2></div>
        {documents.map(file => <button key={file.path} type="button" disabled={!file.readable} className={`resource-document-row${file.path === activeFile ? ' reading' : ''}`} onClick={() => open(file.path)}><span className="resource-row-icon"><FileTextOutlined /></span><span className="resource-row-text"><strong>{file.path}</strong><small>{file.path === 'SKILL.md' ? '适用目标、执行方法与完成标准' : file.readable ? '参考材料' : file.reason}</small></span><RightOutlined /></button>)}
      </section>
      <section className="resource-section"><div className="resource-section-head"><h2>维护信息</h2><Button size="small" disabled={skill.required} onClick={() => onAction(skill.enabled ? 'disable' : 'enable', skill)}>{skill.enabled ? '停用技能' : '启用技能'}</Button></div><p className="page-copy">{skill.required ? '此技能是工作空间必需项。' : '启用情况由当前工作空间维护。'}修改内容时由智能体（Agent）核对权威源与归属。</p><code className="resource-path">{skill.sourcePath || '未登记本地源目录'}</code></section>
    </div>{children}
  </WorkspaceStage>;
}
