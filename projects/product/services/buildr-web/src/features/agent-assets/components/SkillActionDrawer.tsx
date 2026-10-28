import { useEffect, useRef, useState } from 'react';
import { Button, Input, Segmented } from 'antd';
import { DrawerShell } from '../../../components/DrawerShell';
import { CopyButton } from '../../../components/CopyButton';
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
  const [copyError, setCopyError] = useState('');
  const output = useRef<HTMLTextAreaElement>(null);
  const input = drafts[kind] || '';
  const needsInput = kind === 'add' || kind === 'create' || kind === 'adjust';
  const prompt = root && (!needsInput || input.trim()) ? skillActionPrompt(root, kind, input, skill) : '';
  const title = kind === 'adjust' ? '请智能体调整' : kind === 'enable' ? '请智能体启用' : kind === 'disable' ? '请智能体停用' : '添加技能';
  useEffect(() => { setCopyError(''); }, [prompt]);
  useEffect(() => { if (copyError) { output.current?.focus(); output.current?.select(); } }, [copyError]);
  return <DrawerShell open={open} width="min(560px, 100vw)" rootClassName="skills-action-drawer"
    eyebrow="AGENT ACTION" title={title} sub={skill?.title || '当前工作空间'}
    onClose={onClose} afterOpenChange={(visible) => { if (!visible) onClosed(); }}
    closeAriaLabel="关闭技能操作"
    footer={<div className="skills-action-footer"><span className="page-copy" role="status">尚未执行</span><CopyButton key={prompt} type="primary" size="middle" text={prompt} disabled={!prompt} onFailure={() => { setExpanded(true); setCopyError('无法自动复制，已选中完整指令，请手动复制。'); }}>复制指令</CopyButton></div>}>
    {(action === 'add' || action === 'create') && <Segmented block value={kind} options={[{ label: '已有来源', value: 'add' }, { label: '描述需求', value: 'create' }]} onChange={(value) => setKind(value as SkillAction)} />}
    {needsInput ? <><label className="skills-field" htmlFor="skill-action-input">{kind === 'add' ? '目录或链接' : '你的需求'}</label><Input.TextArea id="skill-action-input" rows={5} value={input} maxLength={12000} placeholder={kind === 'add' ? '粘贴本机目录或来源链接' : '例如：优先列出最重要的三个问题…'} onChange={(event) => onDraftChange(kind, event.target.value)} /></>
      : <p className="page-copy">由智能体核对依赖和维护归属，再处理启用情况及必要同步。</p>}
    <div className="skills-preview-heading"><label className="skills-field" htmlFor="skill-prompt">指令预览</label><Button type="text" size="small" disabled={!prompt} onClick={() => setExpanded(!expanded)}>{expanded ? '收起全文' : '展开全文'}</Button></div>
    <textarea id="skill-prompt" ref={output} className={`skills-prompt ${expanded ? 'skills-prompt-expanded' : 'skills-prompt-compact'}`} readOnly value={prompt} placeholder="填写需求后，完整指令会在这里实时更新。" />
    {copyError && <p className="skills-copy-error" role="alert">{copyError}</p>}
    <p className="skills-draft-note">关闭后保留本页草稿，刷新页面后清除。复制指令后交给智能体执行。</p>
  </DrawerShell>;
}
