import { useEffect, useState } from 'react';
import { Button, Input, Modal } from 'antd';
import { Link } from 'react-router-dom';
import { MarkdownHost } from '../../components/MarkdownHost';
import { formatDateTime, taskStatusLabel } from '../../lib/taskLabels';
import { Fact } from './shared';

type Props = {
  active: boolean;
  data: any;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onHandle: (status: 'pending' | 'handled' | 'no-action', note?: string) => void;
  taskHref: (taskId: string) => string;
};

const DISPOSITION_LABELS = {
  pending: '未处理',
  handled: '已处理',
  'no-action': '无需处理',
} as const;

export function RetrospectiveTab({ active, data, loading, error, onRefresh, onHandle, taskHref }: Props) {
  const present = Boolean(data?.slot?.present);
  const disposition = data?.slot?.disposition;
  const [note, setNote] = useState('');
  const [handleOpen, setHandleOpen] = useState(false);

  useEffect(() => {
    setNote(disposition?.status === 'pending' ? '' : disposition?.note || '');
    if (disposition?.status !== 'pending') setHandleOpen(false);
  }, [data?.slot?.currentDigest, disposition?.note, disposition?.status]);

  const pending = disposition?.status === 'pending';
  const noteReady = Boolean(note.trim());

  return (
    <section id="task-retrospective-panel" className={active ? '' : 'hidden'} data-task-panel="retrospective" aria-live="polite">
      <article className="panel review-summary">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Agent 执行效率</p>
            <h2>任务复盘（Task Retrospective）</h2>
            <p className="section-copy">复盘报告保持只读；处置状态只记录已做出判断，不会影响任务状态、研发交接或收尾。</p>
          </div>
          <Button id="task-retrospective-refresh" disabled={loading} onClick={onRefresh}>
            刷新复盘
          </Button>
        </div>
        <div id="task-retrospective-diagnostic" className={`environment-diagnostic${error ? '' : ' hidden'}`}>
          {error || ''}
        </div>
      </article>
      <div id="task-retrospective-loading" className={`page-loading${loading ? '' : ' hidden'}`}>
        <span className="loader" />
        <p>正在读取复盘…</p>
      </div>
      <section
        id="task-retrospective-content"
        className={present ? 'panel retrospective-result' : data ? 'empty-state' : 'panel'}
      >
        {!data ? null : present ? (
          <>
            <div className="retrospective-facts-module">
              <dl className="read-facts retrospective-facts">
                <Fact label="关注范围" value="Agent 执行效率" />
                <Fact label="完成时间" value={formatDateTime(data.slot.result.completedAt)} />
              </dl>
              {pending ? (
                <Button id="task-retrospective-handle-open" size="small" onClick={() => setHandleOpen(true)}>
                  复盘处理
                </Button>
              ) : null}
            </div>
            <section className="retrospective-disposition" aria-label="复盘处置">
              <div className="retrospective-disposition-heading">
                <div>
                  <p className="eyebrow">复盘处置</p>
                  <h3>{DISPOSITION_LABELS[disposition.status as keyof typeof DISPOSITION_LABELS]}</h3>
                </div>
                {!pending ? (
                  <Button id="task-retrospective-reopen" disabled={loading} onClick={() => onHandle('pending')}>
                    重新打开
                  </Button>
                ) : null}
              </div>
              {!pending ? (
                <dl className="read-facts retrospective-disposition-facts">
                  <Fact label="处置说明" value={disposition.note} />
                  <Fact label="处置时间" value={formatDateTime(disposition.disposedAt)} />
                </dl>
              ) : null}
            </section>
            <Modal
              title="复盘处理"
              open={handleOpen}
              onCancel={() => setHandleOpen(false)}
              footer={null}
              destroyOnClose
              width={520}
              className="task-action-modal"
            >
              <div className="retrospective-disposition-form">
                <label htmlFor="task-retrospective-disposition-note">
                  处置说明
                  <Input.TextArea
                    id="task-retrospective-disposition-note"
                    rows={3}
                    placeholder="记录处理结论，或说明为什么无需处理"
                    value={note}
                    disabled={loading}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
                <div className="actions">
                  <Button id="task-retrospective-handle" type="primary" disabled={loading || !noteReady} onClick={() => onHandle('handled', note.trim())}>
                    标记已处理
                  </Button>
                  <Button id="task-retrospective-no-action" disabled={loading || !noteReady} onClick={() => onHandle('no-action', note.trim())}>
                    无需处理
                  </Button>
                </div>
              </div>
            </Modal>
            <section className="retrospective-followups" aria-label="后续承接任务">
              <div className="retrospective-disposition-heading">
                <div>
                  <p className="eyebrow">落地结果</p>
                  <h3>后续承接任务</h3>
                </div>
              </div>
              {!data.followupTasks?.length ? (
                <p className="empty-copy">当前没有关联的承接 Task。</p>
              ) : (
                <span className="task-change-links">
                  {data.followupTasks.map((task: { taskId: string; title: string; status: string }) => (
                    <Link key={task.taskId} className={`task-change-link ${task.status}`} to={taskHref(task.taskId)}>
                      {`${task.title} · ${task.taskId} · ${taskStatusLabel(task.status)}`}
                    </Link>
                  ))}
                </span>
              )}
            </section>
            <h3>原始复盘</h3>
            <MarkdownHost markdown={data.slot.result.reportMarkdown} options={{ headingOffset: 1 }} />
            <small className="review-result-path">{`${data.slot.resultDigest} · ${data.slot.path}`}</small>
          </>
        ) : (
          <>
            <h2>尚未复盘</h2>
            <p>当前 Task 没有复盘记录；这不会阻止任务完成、交付或清理。</p>
          </>
        )}
      </section>
    </section>
  );
}
