import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { Alert, Button, Dropdown, Input, Space, Spin, Tooltip } from 'antd';
import { CheckOutlined, CopyOutlined, DownOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAgentRuntime } from '../../../app/AgentRuntimeContext';
import { AgentActionControl } from '../../../components/AgentActionControl';
import { copyText } from '../../../lib/copyText';
import { agentOption, executionConfigSummary } from '../../agents/agent-model';
import type { CommitMode, CodeActionSource } from '../api/code-actions-api';
import type { SourceControlRepository, SourceControlWorktree } from '../source-control-model';
import { actionSourceKey, commitResultFeedback, type SourceControlActions } from '../source-control-actions';
import './source-control-commit.css';

type MessageSelection = {start:number; end:number; direction:HTMLTextAreaElement['selectionDirection']};
// The action owner outlives a hidden history panel. Weak ownership also releases
// these small presentation facts when the workspace's action adapter is disposed.
const messageSelections = new WeakMap<SourceControlActions, Map<string, MessageSelection>>();

type Props = {active?: boolean; workspaceId: string; repository: SourceControlRepository; worktree: SourceControlWorktree; actions: SourceControlActions; version: string};
export function SourceControlCommitPanel({active = true, workspaceId, repository, worktree, actions, version}: Props) {
  const agents = useAgentRuntime();
  const source: CodeActionSource = {workspaceId, repositoryId: repository.id, worktreeId: worktree.worktreeId, branch: worktree.branch};
  const key = actionSourceKey(source), state = actions.state(source);
  const textarea=useRef<TextAreaRef>(null);
  let selections=messageSelections.get(actions);
  if(!selections){selections=new Map();messageSelections.set(actions,selections);}
  const positions=selections;
  useLayoutEffect(()=>{
    const input=textarea.current?.resizableTextArea?.textArea;
    if(!active||!input)return;
    const saved=positions.get(key);
    // Each source owns its textarea node, so its controlled draft is already the
    // node's value here. Restoration happens once before a user can start typing.
    if(saved)input.setSelectionRange(Math.min(saved.start,input.value.length),Math.min(saved.end,input.value.length),saved.direction);
    const remember=()=>positions.set(key,{start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection});
    for(const event of ['select','input','blur','keyup','pointerup'])input.addEventListener(event,remember);
    return()=>{remember();for(const event of ['select','input','blur','keyup','pointerup'])input.removeEventListener(event,remember);};
  },[key,active,positions]);
  const [feedback, setFeedback] = useState(''), [menuOpen, setMenuOpen] = useState(false);
  const context = state.context, generating = Boolean(state.generation), writing = Boolean(state.gitPending);
  useEffect(() => { if (active) { void actions.observe(source); setFeedback(''); } }, [active, actions, key, version]);
  const options = agents.registry?.agents.map(agentOption) || [];
  const defaultExecutor = options.find(option => option.id === agents.registry?.defaultAgentId) || null;
  const nextExecutor = state.overrideId ? options.find(option => option.id === state.overrideId) || null : defaultExecutor;
  const executor = state.generation ? {id: state.generation.agentId, label: state.generation.label, available: true} : nextExecutor;
  const scope = `${repository.name} · ${worktree.isMain ? '主工作树' : worktree.name} ${worktree.branch || worktree.head?.slice(0, 8) || ''}；全部未提交变更，包含已暂存、未暂存和未跟踪。`;
  const provenance = state.generatedBy ? ['由 ' + state.generatedBy.label + ' 生成', executionConfigSummary(state.generatedBy.executionConfig)].filter(Boolean).join(' · ') : '';
  const pushScope = scope + ' 推送包含当前分支此前所有未推送提交。' + (context?.push.target ? `目标：${context.push.target}。` : '未设置可核实上游时，只完成提交并停止推送，不猜测目标。');
  const syncScope = scope + ' 提交后获取（Fetch）固定上游，必要时快进（Fast-forward）或变基（Rebase），再普通推送（Push）；包含当前分支此前所有未推送提交。' + (context?.push.target ? `目标：${context.push.target}。` : '未设置可核实上游时，只完成提交并停止同步，不猜测目标。');
  const ready = Boolean(context && !state.contextLoading && !state.contextError), noChanges = !context?.hasChanges;
  const disabledCommit = !ready || noChanges || !state.text.trim() || generating || writing || state.unknownCommit;
  useEffect(() => { setMenuOpen(false); }, [key, active, disabledCommit]);
  const commit = (nextMode: CommitMode) => {
    setMenuOpen(false);
    if (!active || disabledCommit) return;
    void actions.commit(source, nextMode);
  };
  const expandedMessage = Boolean(state.text && (state.generatedBy || /[\r\n]/.test(state.text)));
  const result = state.gitResult;
  const resultFeedback = result ? commitResultFeedback(result) : null;
  const pendingText = state.gitPending === 'push' ? '正在推送…' : state.gitPending === 'commit-sync' ? '正在提交并同步…' : state.gitPending === 'commit-push' ? '正在提交并推送…' : state.gitPending ? '正在提交…' : '提交';
  const generationPhase = state.generation?.phase === 'cancelling' ? '正在取消…' : state.generation?.phase === 'running' ? '正在生成…' : '正在准备…';
  const copy = async () => setFeedback(await copyText(state.text) ? '已复制说明' : '无法复制，请选中文字后手动复制。');
  return <section className="source-control-commit-panel" aria-label="提交变更" data-source-commit-key={key}>
    <div className="source-control-message-input"><Input.TextArea key={key} ref={textarea} id="commit-message-text" aria-label="提交说明内容" title={provenance ? `${provenance}；${scope}` : scope} placeholder="提交说明" value={state.text} disabled={generating || writing} onChange={event => {actions.setText(source, event.target.value); setFeedback('');}} autoSize={{minRows: expandedMessage ? 6 : 1, maxRows: 12}} />
      <AgentActionControl id="generate-commit-message" label={state.generatedBy ? '重新生成提交说明' : '生成提交说明'} executor={executor} defaultExecutor={defaultExecutor} options={options} overrideId={state.overrideId} disabled={!ready || noChanges || writing} pending={generating} onAction={() => {if (nextExecutor) void actions.generate(source, nextExecutor);}} onSelect={id => actions.setOverride(source, id)} onOpenAgents={() => agents.setOpen(true)} />
    </div>
    {generating && <div className="source-control-generation-status" role="status"><Spin size="small" /><span>{generationPhase}</span><Button id="cancel-commit-message" size="small" type="text" onClick={() => void actions.cancel(source)}>{state.generation?.phase === 'cancelling' ? '重试取消' : '取消'}</Button></div>}
    <div className="source-control-commit-actions"><Space.Compact className="source-control-commit-split" size="small">
      <Tooltip title={state.contextLoading || !context ? '正在核对当前变更' : state.contextError || (!state.text.trim() ? '请先填写提交说明' : noChanges ? '没有未提交变更' : scope)}><Button id="commit-changes" type="primary" size="small" icon={<CheckOutlined />} loading={writing} disabled={disabledCommit} onClick={() => commit('commit')}>{pendingText}</Button></Tooltip>
      <Dropdown trigger={['click']} open={menuOpen && active && !disabledCommit} onOpenChange={open => setMenuOpen(open && !disabledCommit)} menu={{selectable: false, items: [{key: 'commit-sync', label: <Tooltip title={syncScope}><span>提交并同步</span></Tooltip>, disabled: disabledCommit}, {key: 'commit-push', label: <Tooltip title={pushScope}><span>提交并推送</span></Tooltip>, disabled: disabledCommit}], onClick: ({key: next}) => {if (next === 'commit-sync' || next === 'commit-push') commit(next);}}}><Button id="commit-action-menu" aria-label="选择提交操作" type="primary" size="small" icon={<DownOutlined />} disabled={disabledCommit} /></Dropdown>
    </Space.Compact>
      {state.text && <><Tooltip title={(provenance ? `${provenance}，可编辑；` : '') + scope}><Button id="commit-message-info" type="text" size="small" aria-label="查看说明来源" icon={<InfoCircleOutlined />} /></Tooltip><Tooltip title="复制提交说明"><Button id="copy-commit-message" type="text" size="small" aria-label="复制提交说明" icon={<CopyOutlined />} disabled={generating || writing} onClick={() => void copy()} /></Tooltip></>}
    </div>
    {result && resultFeedback && <><div className={'source-control-commit-result' + (resultFeedback.warning ? ' is-warning' : '')} role="status"><Tooltip title={resultFeedback.details}><span>{resultFeedback.text}</span></Tooltip>{result.commit.completed && !result.sync && result.push.retry && !state.unknownCommit && <Button id="retry-push" type="link" size="small" disabled={writing} onClick={() => void actions.retryPush(source)}>重试推送</Button>}</div>{resultFeedback.note && <p className="source-control-action-note">{resultFeedback.note}</p>}</>}
    {state.unknownCommit && <Alert type="warning" showIcon message="提交结果尚未确认，请先重新核对。" action={<Button id="recheck-commit" size="small" disabled={writing || state.contextLoading} onClick={() => void actions.recheck(source)}>重新核对</Button>} />}
    {state.contextError && <Alert type="warning" showIcon message={state.contextError} action={<Button size="small" onClick={() => void actions.recheck(source)}>重新读取</Button>} />}
    {(state.generationError || state.gitError) && <Alert type="warning" showIcon message={state.generationError || state.gitError} />}
    {state.generationWarning && <Alert id="commit-generation-cleanup-warning" type="warning" showIcon message={state.generationWarning} />}
    {state.stale && !state.generationError && <p className="source-control-action-note">变更已更新，请核对说明。</p>}
    {!generating && !agents.loading && !nextExecutor?.available && <p className="source-control-action-note">暂时无法生成说明<Button type="link" size="small" onClick={() => agents.setOpen(true)}>查看智能体</Button></p>}
    {feedback && <p className="source-control-action-note" role="status">{feedback}</p>}
  </section>;
}
