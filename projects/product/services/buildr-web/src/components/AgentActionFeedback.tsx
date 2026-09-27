import { useCallback, useEffect, useState } from 'react';
import { createPromptRequest } from '../lib/promptRequest';
import { Alert, Button, Input } from 'antd';

export const ACTION_LABELS: Record<string, string> = {
  workspace: '工作空间',
  project: '项目',
  service: '服务',
  start: '任务',
  'task-review': '任务审查',
  'task-verification': '任务验证',
  'release-update': 'Buildr 版本更新',
  'daily-progress': '项目每日演进',
};

/** 动作表单共用的结果、错误和复制反馈；领域输入与请求留在所属组件。 */
export function useAgentActionFeedback(backToChooser: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copyState, setCopyState] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [request] = useState(createPromptRequest);
  useEffect(() => () => request.invalidate(), [request]);
  const invalidatePrompt = useCallback(() => {
    request.invalidate();
    setPrompt(null);
    setError(null);
    setCopyState('');
    setPreparing(false);
  }, [request]);
  const updateInput = (update: () => void) => {
    invalidatePrompt();
    update();
  };
  const copyPrompt = async (noun: string, unchangedState: string) => {
    if (!prompt) return;
    const current = request.observe();
    try {
      await navigator.clipboard.writeText(prompt);
      if (current()) setCopyState(`指令已复制。${unchangedState || `${noun}尚未创建。`}`);
    } catch {
      if (current()) setCopyState(`自动复制失败，请选择指令手动复制。${unchangedState || `${noun}尚未创建。`}`);
    }
  };

  const showResult = (nextPrompt: string, noun: string, unchangedState = '') => {
    setPrompt(nextPrompt);
    setCopyState(unchangedState || `${noun}尚未创建。`);
  };

  const generatePrompt = (prepare: () => string | Promise<string>, noun: string, unchangedState = '', fallback = '生成指令失败。') => request.run(prepare, {
    start: () => { setPrompt(null); setError(null); setCopyState(''); setPreparing(true); },
    ready: (value) => showResult(value, noun, unchangedState),
    failed: (error) => setError(error instanceof Error ? error.message : fallback),
    settled: () => setPreparing(false),
  });

  const copyProvidedPrompt = async (value: string, unchangedState: string) => {
    const current = request.observe();
    try {
      await navigator.clipboard.writeText(value);
      if (current()) setCopyState(`指令已复制。${unchangedState}`);
    } catch {
      if (current()) setCopyState(`自动复制失败，请选择指令手动复制。${unchangedState}`);
    }
  };


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
          <Button
            id="copy-action-prompt"
            onClick={() => void copyPrompt(noun, unchangedState)}
          >
            复制指令
          </Button>
          <span id="action-copy-state">{copyState}</span>
        </div>
      </div>
    ) : null
  );


  return { error, setError, prompt, copyState, setCopyState, preparing, invalidatePrompt, updateInput, generatePrompt, showResult, copyProvidedPrompt, formHeader, promptResult };
}
