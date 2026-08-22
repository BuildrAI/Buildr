import { useEffect, useState } from 'react';
import { Button, Card, Modal, Space } from 'antd';
import { taskProfessionalApi, type ApiError, type TaskExecutionRecordBodyViewResponse, type TaskExecutionRecordDetailView, type TaskExecutionRecordsView, type TaskExecutionRecordView } from '../../api';
import { formatDateTime } from '../../lib/taskLabels';
import { Fact } from './shared';

export type ExecutionRecordView = 'all' | 'verification' | 'finish';

type Props = {
  taskId: string;
  view: ExecutionRecordView;
  data: TaskExecutionRecordsView | null;
  loading: boolean;
  error: string | null;
  onSelectView: (view: ExecutionRecordView) => void;
  onRefresh: () => void;
};

const VIEW_LABELS: Record<ExecutionRecordView, string> = {
  all: '全部',
  verification: 'Verification',
  finish: 'Finish',
};

function ownerLabel(owner: string) {
  return owner === 'task-verification' ? 'Verification' : owner === 'task-finish' ? 'Finish' : owner;
}

function bodyState(record: TaskExecutionRecordView) {
  if (record.body.available) return record.body.truncated ? '正文可读（已截断保存）' : '正文可读';
  if (record.body.status === 'cleaned') return '正文已清理，metadata 保留';
  return `正文不可用（${record.body.status}）`;
}

export function ExecutionRecordsPanel({ taskId, view, data, loading, error, onSelectView, onRefresh }: Props) {
  const [detail, setDetail] = useState<TaskExecutionRecordDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [body, setBody] = useState<TaskExecutionRecordBodyViewResponse | null>(null);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    setDetail(null);
    setDetailError(null);
    setBody(null);
    setBodyError(null);
    setModalOpen(false);
  }, [taskId, view]);

  async function openRecord(recordId: string) {
    setModalOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setBody(null);
    setBodyError(null);
    try {
      setDetail(await taskProfessionalApi.executionRecordDetail(taskId, recordId));
    } catch (err) {
      setDetailError(`${(err as ApiError).code || 'task_execution_record_read_failed'}：${err instanceof Error ? err.message : '读取失败'}`);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openBody(recordId: string, filename: string) {
    setBodyLoading(true);
    setBodyError(null);
    try {
      setBody(await taskProfessionalApi.executionRecordBody(taskId, recordId, filename));
    } catch (err) {
      setBody(null);
      setBodyError(`${(err as ApiError).code || 'task_execution_record_body_read_failed'}：${err instanceof Error ? err.message : '读取失败'}`);
    } finally {
      setBodyLoading(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setDetail(null);
    setDetailError(null);
    setBody(null);
    setBodyError(null);
  }

  const records = data?.records || [];
  const selected = detail?.record;

  return (
    <section id="task-execution-records-panel" className="evidence-section execution-records-panel" aria-live="polite">
      <article className="panel review-summary">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">有限期执行历史</p>
            <h2>执行记录（Execution Records）</h2>
            <p className="section-copy">同一 authority 的只读视图；记录 outcome 不等于当前 Verification Result 或 Finish 交付事实。</p>
          </div>
          <Button disabled={loading} onClick={onRefresh}>刷新执行记录</Button>
        </div>
        <Space className="execution-record-filters" wrap role="group" aria-label="执行记录筛选">
          {(Object.keys(VIEW_LABELS) as ExecutionRecordView[]).map((candidate) => (
            <Button
              key={candidate}
              id={`task-execution-record-filter-${candidate}`}
              type={view === candidate ? 'primary' : 'default'}
              aria-pressed={view === candidate}
              onClick={() => onSelectView(candidate)}
            >
              {VIEW_LABELS[candidate]}
            </Button>
          ))}
        </Space>
        {error ? <p className="environment-diagnostic">{error}</p> : null}
      </article>
      {loading ? <div className="page-loading"><span className="loader" /><p>正在读取执行记录…</p></div> : null}
      {!loading && !records.length ? <section className="empty-state"><h3>没有{VIEW_LABELS[view]}执行记录</h3><p>这里不会从 Result、Finish current 或文件系统推断历史记录。</p></section> : null}
      <div id="task-execution-record-list" className="execution-record-list">
        {records.map((record) => (
          <Card
            key={record.recordId}
            size="small"
            hoverable
            className={`execution-record-card ${record.outcome}`}
            onClick={() => { void openRecord(record.recordId); }}
          >
            <div className="execution-record-card-heading">
              <strong>{ownerLabel(record.owner)} · {record.outcome}</strong>
              <span>{formatDateTime(record.timestamps.sealedAt || record.timestamps.openedAt)}</span>
            </div>
            <div>{record.runIdentity}</div>
            <small>{record.lifecycleStatus} · {record.resolutionStatus} · {bodyState(record)}</small>
          </Card>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onCancel={closeModal}
        footer={null}
        width={720}
        destroyOnClose
        title={selected ? `${ownerLabel(selected.owner)} · ${selected.outcome}` : '执行记录详情'}
      >
        <div id="task-execution-record-detail" className="execution-record-detail-modal">
          {detailLoading ? <div className="page-loading"><span className="loader" /><p>正在读取记录详情…</p></div> : null}
          {detailError ? <p className="environment-diagnostic">{detailError}</p> : null}
          {selected ? (
            <>
              <div className="panel-heading" style={{ marginBottom: 12 }}>
                <div>
                  <p className="eyebrow">{ownerLabel(selected.owner)}</p>
                  <h3 style={{ margin: 0 }}>{selected.recordId}</h3>
                </div>
                <span className={`state review-state ${selected.outcome}`}>{selected.outcome}</span>
              </div>
              <dl className="read-facts detail-facts">
                <Fact label="执行身份" value={selected.runIdentity} />
                <Fact label="目标身份" value={selected.targetIdentity} />
                <Fact label="Producer" value={selected.producer} />
                <Fact label="Lifecycle" value={selected.lifecycleStatus} />
                <Fact label="失败处置" value={selected.resolutionStatus} />
                <Fact label="正文状态" value={bodyState(selected)} />
                <Fact label="保留至" value={formatDateTime(selected.retention.retainUntil)} />
              </dl>
              {selected.body.diagnostic ? <p className="environment-diagnostic">{selected.body.diagnostic.message}</p> : null}
              {selected.body.files?.length ? (
                <div className="execution-record-files">
                  {selected.body.files.map((file) => (
                    <Button key={file.name} disabled={bodyLoading} onClick={() => { void openBody(selected.recordId, file.name); }}>
                      {file.name} · {file.storedSizeBytes} B{file.truncated ? ' · 已截断保存' : ''}
                    </Button>
                  ))}
                </div>
              ) : <p className="section-copy">当前没有可读取的正文文件。</p>}
              {bodyError ? <p className="environment-diagnostic">{bodyError}</p> : null}
              {body?.file ? (
                <section className="execution-record-body">
                  <div className="execution-record-body-heading">
                    <strong>{body.file.name}</strong>
                    <span>{body.file.responseSizeBytes} B{body.file.responseTruncated ? ' · 响应已限量' : ''}</span>
                  </div>
                  <pre>{body.file.content}</pre>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </Modal>
    </section>
  );
}
