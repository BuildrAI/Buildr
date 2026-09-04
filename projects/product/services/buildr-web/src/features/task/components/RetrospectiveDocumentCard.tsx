import { Alert, Button, Modal, Spin } from 'antd';

import { useTaskRetrospective } from '../hooks/useTaskRetrospective';
import type {
  RetrospectiveDocumentReference,
} from '../api/generated/task-dto';
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

export function RetrospectiveDocumentCard({ taskId, recordDigest, reference, onRecordUpdated }: Props) {
  const retrospective = useTaskRetrospective(taskId, recordDigest, onRecordUpdated);

  const registered = reference.registered;
  return (
    <section className="panel retrospective-document-card" id="task-retrospective-document-card">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">本机文档</p>
          <h2>任务复盘</h2>
          <p className="section-copy">只有你明确要求时，Agent才会生成复盘；文档保存在本机，不进入代码仓库。</p>
        </div>
        {registered ? <Button id="task-retrospective-document-open" onClick={() => void retrospective.load()}>查看复盘</Button> : null}
      </div>
      <dl className="read-facts retrospective-document-facts">
        <div><dt>状态</dt><dd id="task-retrospective-document-state">{registered ? stateLabel[registered.state] : '无复盘文档'}</dd></div>
        <div><dt>本机路径</dt><dd><code>{reference.path}</code></dd></div>
      </dl>

      <Modal title="任务复盘" open={retrospective.open} onCancel={() => retrospective.setOpen(false)} footer={<Button onClick={() => retrospective.setOpen(false)}>关闭</Button>} width={900} destroyOnClose>
        {retrospective.loading ? <div className="retrospective-document-loading"><Spin size="small" /> 正在读取本机复盘…</div> : null}
        {retrospective.error ? <Alert type="warning" showIcon message={retrospective.error} /> : null}
        {!retrospective.loading && retrospective.document ? <>
          {retrospective.document.diagnostic ? <Alert type="warning" showIcon message={retrospective.document.diagnostic.message} /> : null}
          <div className="retrospective-document-meta">
            <code>{retrospective.document.path}</code>
            <span>{stateLabel[retrospective.document.effectiveState === 'missing' ? 'pending-decision' : retrospective.document.effectiveState]}</span>
          </div>
          {retrospective.document.content ? <MarkdownHost markdown={retrospective.document.content} className="markdown-body" options={{ headingOffset: 1 }} /> : <p>本机复盘文档当前不可读取。</p>}
          {retrospective.document.content && retrospective.document.effectiveState === 'pending-decision' && retrospective.document.actualDigest === retrospective.document.registeredDigest ? (
            <Button id="task-retrospective-document-decide" type="primary" loading={retrospective.updating} onClick={() => void retrospective.markDecided()}>
              我已完成决定
            </Button>
          ) : null}
        </> : null}
      </Modal>
    </section>
  );
}
