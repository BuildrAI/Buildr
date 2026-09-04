import { useState } from 'react';
import { Alert, Button, Modal, Spin } from 'antd';

import { useTaskEvidence } from '../hooks/useTaskEvidence';
import type {
  RetrospectiveDocumentReference,
  TaskRetrospectiveDocumentResponse,
} from '../api/generated/task-record-dto';
import { MarkdownHost } from '../../../components/MarkdownHost';

import './RetrospectiveDocumentCard.css';

type Props = {
  taskId: string;
  recordDigest: string;
  reference: RetrospectiveDocumentReference;
  onRecordUpdated: () => Promise<void>;
};

const stateLabel: Record<'pending-decision' | 'decided', string> = {
  'pending-decision': '等待你的决定',
  decided: '已经决定',
};

function failureMessage(cause: unknown, fallbackCode: string, fallbackMessage: string): string {
  if (!(cause instanceof Error)) return `${fallbackCode}：${fallbackMessage}`;
  const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : fallbackCode;
  return `${code}：${cause.message || fallbackMessage}`;
}

export function RetrospectiveDocumentCard({ taskId, recordDigest, reference, onRecordUpdated }: Props) {
  const taskEvidence = useTaskEvidence();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [document, setDocument] = useState<TaskRetrospectiveDocumentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDocument = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      setDocument(await taskEvidence.retrospectiveDocument(taskId));
    } catch (cause) {
      setError(failureMessage(cause, 'task_retrospective_document_read_failed', '读取失败'));
      setDocument(null);
    } finally {
      setLoading(false);
    }
  };

  const markDecided = async () => {
    const digest = document?.actualDigest;
    if (!digest) return;
    setUpdating(true);
    setError(null);
    try {
      await taskEvidence.updateRetrospective(taskId, {
        expectedRecordDigest: recordDigest,
        retrospectiveState: 'decided',
        retrospectiveDocumentDigest: digest,
      });
      await onRecordUpdated();
      setDocument((current) => current ? { ...current, registeredState: 'decided', effectiveState: 'decided' } : current);
    } catch (cause) {
      setError(failureMessage(cause, 'task_retrospective_decision_failed', '更新失败'));
    } finally {
      setUpdating(false);
    }
  };

  const registered = reference.registered;
  return (
    <section className="panel retrospective-document-card" id="task-retrospective-document-card">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">本机文档</p>
          <h2>任务复盘</h2>
          <p className="section-copy">只有你明确要求时，Agent才会生成复盘；文档保存在本机，不进入代码仓库。</p>
        </div>
        {registered ? <Button id="task-retrospective-document-open" onClick={() => void loadDocument()}>查看复盘</Button> : null}
      </div>
      <dl className="read-facts retrospective-document-facts">
        <div><dt>状态</dt><dd id="task-retrospective-document-state">{registered ? stateLabel[registered.state] : '无复盘文档'}</dd></div>
        <div><dt>本机路径</dt><dd><code>{reference.path}</code></dd></div>
      </dl>

      <Modal title="任务复盘" open={open} onCancel={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>关闭</Button>} width={900} destroyOnClose>
        {loading ? <div className="retrospective-document-loading"><Spin size="small" /> 正在读取本机复盘…</div> : null}
        {error ? <Alert type="warning" showIcon message={error} /> : null}
        {!loading && document ? <>
          {document.diagnostic ? <Alert type="warning" showIcon message={document.diagnostic.message} /> : null}
          <div className="retrospective-document-meta">
            <code>{document.path}</code>
            <span>{stateLabel[document.effectiveState === 'missing' ? 'pending-decision' : document.effectiveState]}</span>
          </div>
          {document.content ? <MarkdownHost markdown={document.content} className="markdown-body" options={{ headingOffset: 1 }} /> : <p>本机复盘文档当前不可读取。</p>}
          {document.content && document.effectiveState === 'pending-decision' && document.actualDigest === document.registeredDigest ? (
            <Button id="task-retrospective-document-decide" type="primary" loading={updating} onClick={() => void markDecided()}>
              我已完成决定
            </Button>
          ) : null}
        </> : null}
      </Modal>
    </section>
  );
}
