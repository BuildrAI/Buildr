import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Descriptions, Drawer, Empty, List, Space, Spin, Tabs, Tag } from 'antd';
import { CloseOutlined, ExpandOutlined } from '@ant-design/icons';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { agentAssetsApi, type SkillDetail, type SkillFile, type SkillSummary } from '../api/agent-assets-api';
import { resolveSkillLink, type SkillAction } from '../skill-presentation';

type Props = { children?: ReactNode; skill: SkillSummary; onClose: () => void; onAction: (action: SkillAction, skill: SkillSummary) => void };
export function SkillDetailDrawer({ skill, onClose, onAction, children }: Props) {
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState('说明');
  const [wide, setWide] = useState(false);
  const [filePath, setFilePath] = useState('SKILL.md');
  const [file, setFile] = useState<SkillFile | null>(null);
  const [fileError, setFileError] = useState('');
  const [raw, setRaw] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController(); setDetail(null); setError('');
    void agentAssetsApi.skillDetail(skill.id, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setDetail(data); })
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [skill.id, retry]);
  const reading = tab === '说明' || (tab === '相关资料' && filePath !== '');
  useEffect(() => {
    const controller = new AbortController(); setFile(null); setFileError('');
    if (reading) void agentAssetsApi.skillFile(skill.id, filePath, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setFile(data); })
      .catch((err: Error) => { if (!controller.signal.aborted) setFileError(err.message); });
    return () => controller.abort();
  }, [skill.id, filePath, reading, retry]);
  const active = detail?.skill || skill;
  const openFile = (path: string, remember = true) => {
    if (remember) setHistory((value) => [...value, filePath]);
    setFilePath(path); setRaw(false); setTab('相关资料');
  };
  const onLink = (href: string) => {
    const resolved = resolveSkillLink(filePath, href);
    if (resolved === filePath) return;
    if (resolved) openFile(resolved); else setFileError('该引用不在当前技能目录内，无法在这里打开。');
  };
  return <Drawer open push={false} rootClassName="skills-detail-drawer" width={wide ? 'min(1100px, 100vw)' : 'min(720px, 100vw)'}
    title={<div className="skills-drawer-title">{active.title}<small>{active.id}</small></div>} closable={false} keyboard={!children} maskClosable={!children} onClose={() => { if (!children) onClose(); }}
    extra={<Space><Button type="text" icon={<ExpandOutlined />} aria-label={wide ? '收起阅读' : '展开阅读'} onClick={() => setWide(!wide)} /><Button type="text" icon={<CloseOutlined />} aria-label="关闭技能详情" onClick={onClose} /></Space>}
    footer={<div className="skills-action-footer"><span className="page-copy">基于工作空间当前源文件</span><Button onClick={() => onAction('adjust', active)}>请智能体调整</Button></div>}>
    <Tabs activeKey={tab} onChange={(value) => { setTab(value); setFilePath(value === '说明' ? 'SKILL.md' : ''); setHistory([]); setRaw(false); }} items={['说明', '相关资料', '管理'].map((label) => ({ key: label, label }))} />
    {error && <Alert type="error" message={error} action={<Button onClick={() => setRetry(retry + 1)}>重试</Button>} />}
    {reading ? <>
      <div className="skills-file-toolbar"><Space>{tab === '相关资料' && <Button type="text" onClick={() => { const previous = history.at(-1); setHistory((value) => value.slice(0, -1)); if (previous) { setFilePath(previous); setTab(previous === 'SKILL.md' ? '说明' : '相关资料'); } else setFilePath(''); setRaw(false); }}>← 返回</Button>}<span>{filePath}</span></Space><Button type="text" disabled={!file} onClick={() => setRaw(!raw)}>{raw ? '阅读模式' : '查看原文'}</Button></div>
      {fileError ? <Alert type="warning" showIcon message={fileError} action={<Button onClick={() => setRetry(retry + 1)}>重试</Button>} /> : !file ? <Spin aria-label="正在读取技能文件" /> : raw || file.format === 'text' ? <pre className="skills-source">{file.content}</pre> : <MarkdownHost key={file.path} markdown={file.readingContent} className="markdown-body" options={{ allowRelativeLinks: true, allowParentRelativeLinks: true, onRelativeLinkClick: onLink }} />}
    </> : tab === '相关资料' ? <>
      {detail?.issue && <Alert type="warning" message={detail.issue} />}
      {detail?.truncated && <Alert type="info" message="文件列表已达到展示上限，部分内容未列出。" />}
      <List loading={!detail && !error} dataSource={detail?.files.filter((entry) => entry.path !== 'SKILL.md') || []} locale={{ emptyText: <Empty description="没有可列出的附属资料" /> }} renderItem={(entry) => <List.Item><Button className="skills-file-button" type="text" disabled={!entry.readable} onClick={() => openFile(entry.path, false)}><span>{entry.path}</span><small>{entry.readable ? `${Math.ceil(entry.size / 1024)} KB　查看 ›` : entry.reason}</small></Button></List.Item>} />
    </> : <>
      <div className="skills-owner-note"><strong>{active.sourceLabel}</strong><p>维护前核对源资产和所属组件，不直接改写生成副本。</p></div>
      <Descriptions column={1} size="small" items={[{ key: 'registered', label: '登记情况', children: '已登记' }, { key: 'enabled', label: '启用情况', children: <Tag>{active.enabled ? '已启用' : '已停用'}</Tag> }, { key: 'source', label: '源目录', children: active.sourcePath || '未登记本地源目录' }, { key: 'reference', label: '来源地址', children: active.sourceReference || '未提供' }, { key: 'sync', label: '同步情况', children: '此页面尚未检查，不代表未同步或已加载' }]} />
      {active.contentIssue && <Alert type="warning" message={active.contentIssue} />}
      <Button className="skills-toggle" disabled={active.required} onClick={() => onAction(active.enabled ? 'disable' : 'enable', active)}>请智能体{active.enabled ? '停用' : '启用'}</Button>
      {active.required && <p className="page-copy">此技能为必需项，不能在这里停用。</p>}
    </>}
    {children}
  </Drawer>;
}
