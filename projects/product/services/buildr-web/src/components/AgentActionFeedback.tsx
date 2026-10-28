import { useCallback, useEffect, useState } from 'react';
import { createPromptRequest } from '../lib/promptRequest';
import { CopyButton } from './CopyButton';
import { Alert, Button, Input } from 'antd';

export const ACTION_LABELS: Record<string, string> = {
  workspace: '工作空间',
  project: '项目',
  service: '服务',
  start: '任务',
  'task-review': '任务审查',
  'task-verification': '任务验证',
  'release-update': 'Buildr 版本更新',
};

/** 动作表单共用的结果、错误和复制反馈；领域输入与请求留在所属组件。 */
export function useAgentActionFeedback(backToChooser: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [request] = useState(createPromptRequest);
  useEffect(() => () => request.invalidate(), [request]);
  const invalidatePrompt = useCallback(() => {
    request.invalidate();
    setPrompt(null);
    setError(null);
    setPreparing(false);
  }, [request]);
  const updateInput = (update: () => void) => {
    invalidatePrompt();
    update();
  };
  const showResult = (nextPrompt: string, _noun: string, _unchangedState = '') => {
    setPrompt(nextPrompt);
  };

  const generatePrompt = (prepare: () => string | Promise<string>, noun: string, unchangedState = '', fallback = '生成指令失败。') => request.run(prepare, {
    start: () => { setPrompt(null); setError(null); setPreparing(true); },
    ready: (value) => showResult(value, noun, unchangedState),
    failed: (error) => setError(error instanceof Error ? error.message : fallback),
    settled: () => setPreparing(false),
  });

  const formHeader = (noun: string, verb = '创建') => (
    <>
      <div className="form-header">
        <Button type="link" style={{ paddingInline: 0 }} onClick={backToChooser}>← 返回</Button>
        <span>{verb}{noun}</span>
      </div>
      <p className="drawer-copy">
        {verb === '创建'
          ? `先描述你的目标，再生成交给 Agent 的指令。复制指令不代表${noun}已经创建。`
          : `选择已登记范围并描述目标。Buildr 只完成交接，不会在页面内${verb}任务。`}
      </p>
      <div id="agent-action-error" className={error ? '' : 'hidden'} role="alert" style={{ marginBottom: 12 }}>
        {error ? <Alert type="error" showIcon message={error} /> : null}
      </div>
    </>
  );

  const promptResult = (noun: string, unchangedState = '') => (
    prompt ? (
      <div id="agent-action-result" className="prompt-result">
        <label>
          可复制指令
          <Input.TextArea id="action-prompt-output" rows={13} readOnly value={prompt} />
        </label>
        <div className="copy-row">
          <CopyButton id="copy-action-prompt" size="middle" text={prompt} failureMessage="自动复制失败，请选择指令手动复制。">复制指令</CopyButton>
          <span id="action-copy-state">{unchangedState || `${noun}尚未创建。`}</span>
        </div>
      </div>
    ) : null
  );


  return { error, setError, prompt, preparing, invalidatePrompt, updateInput, generatePrompt, showResult, formHeader, promptResult };
}
