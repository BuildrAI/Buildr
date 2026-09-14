import { useEffect, useRef, useState } from 'react';
import { Button, Drawer, Input, Segmented } from 'antd';
import { CloseOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';
import type { SkillSummary } from '../api/agent-assets-api';
import { skillActionPrompt, type SkillAction } from '../skill-presentation';

type Props = {
  open: boolean; action: SkillAction; skill?: SkillSummary; root: string;
  drafts: Partial<Record<SkillAction, string>>;
  onDraftChange: (action: SkillAction, input: string) => void;
  onClose: () => void; onClosed: () => void;
};
export function SkillActionDrawer({ open, action, skill, root, drafts, onDraftChange, onClose, onClosed }: Props) {
  const [kind, setKind] = useState(action);
  const [expanded, setExpanded] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copying, setCopying] = useState(false);
  const output = useRef<HTMLTextAreaElement>(null);
  const input = drafts[kind] || '';
  const needsInput = kind === 'add' || kind === 'create' || kind === 'adjust';
  const prompt = root && (!needsInput || input.trim()) ? skillActionPrompt(root, kind, input, skill) : '';
  const latestPrompt = useRef(prompt);
  latestPrompt.current = prompt;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setCopyError(''); }, [prompt]);
  useEffect(() => {
    if (!copiedPrompt) return;
    const timer = setTimeout(() => setCopiedPrompt(''), 2200);
    return () => clearTimeout(timer);
  }, [copiedPrompt]);
  useEffect(() => { if (copyError) { output.current?.focus(); output.current?.select(); } }, [copyError]);
  const title = kind === 'adjust' ? '请智能体调整' : kind === 'enable' ? '请智能体启用' : kind === 'disable' ? '请智能体停用' : '添加技能';
  const copy = async () => {
    if (!prompt || copying) return;
    const value = prompt;
    setCopying(true); setCopyError('');
    try {
      await navigator.clipboard.writeText(value);
      if (mounted.current && latestPrompt.current === value) setCopiedPrompt(value);
    } catch {
      if (mounted.current && latestPrompt.current === value) {
        setExpanded(true);
        setCopyError('无法自动复制，已选中完整指令，请手动复制。');
      }
    } finally { if (mounted.current) setCopying(false); }
  };
  const copied = !!prompt && copiedPrompt === prompt;
  return <Drawer open={open} push={false} width="min(560px, 100vw)" rootClassName="skills-action-drawer"
    title={<div className="skills-drawer-title">{title}<small>{skill?.title || '当前工作空间'}</small></div>}
    closable={false} onClose={onClose} afterOpenChange={(visible) => { if (!visible) onClosed(); }}
    extra={<Button type="text" aria-label="关闭技能操作" icon={<CloseOutlined />} onClick={onClose} />}
    footer={<div className="skills-action-footer"><span className="page-copy" role="status">{copied ? '指令已复制，尚未执行' : '尚未执行'} </span><Button type="primary" icon={copied ? <CheckOutlined aria-hidden /> : <CopyOutlined aria-hidden />} disabled={!prompt} loading={copying} onClick={() => void copy()}>{copied ? '已复制' : '复制指令'}</Button></div>}>
    {(action === 'add' || action === 'create') && <Segmented block value={kind} options={[{ label: '已有来源', value: 'add' }, { label: '描述需求', value: 'create' }]} onChange={(value) => setKind(value as SkillAction)} />}
    {needsInput ? <><label className="skills-field" htmlFor="skill-action-input">{kind === 'add' ? '目录或链接' : '你的需求'}</label><Input.TextArea id="skill-action-input" rows={5} value={input} maxLength={12000} placeholder={kind === 'add' ? '粘贴本机目录或来源链接' : '例如：优先列出最重要的三个问题…'} onChange={(event) => onDraftChange(kind, event.target.value)} /></>
      : <p className="page-copy">由智能体核对依赖和维护归属，再处理启用情况及必要同步。</p>}
    <div className="skills-preview-heading"><label className="skills-field" htmlFor="skill-prompt">指令预览</label><Button type="text" size="small" disabled={!prompt} onClick={() => setExpanded(!expanded)}>{expanded ? '收起全文' : '展开全文'}</Button></div>
    <textarea id="skill-prompt" ref={output} className={`skills-prompt ${expanded ? 'skills-prompt-expanded' : 'skills-prompt-compact'}`} readOnly value={prompt} placeholder="填写需求后，完整指令会在这里实时更新。" />
    {copyError && <p className="skills-copy-error" role="alert">{copyError}</p>}
    <p className="skills-draft-note">关闭后保留本页草稿，刷新页面后清除。复制指令后交给智能体执行。</p>
  </Drawer>;
}
