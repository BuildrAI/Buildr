import { MarkdownHost } from '../../components/MarkdownHost';
import { formatDateTime } from '../../lib/taskLabels';
import { Fact } from './shared';

type Props = {
  active: boolean;
  data: any;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

export function RetrospectiveTab({ active, data, loading, error, onRefresh }: Props) {
  const present = Boolean(data?.slot?.present);

  return (
    <section id="task-retrospective-panel" className={active ? '' : 'hidden'} data-task-panel="retrospective" aria-live="polite">
      <article className="panel review-summary">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Agent 执行效率</p>
            <h2>任务复盘（Task Retrospective）</h2>
            <p className="section-copy">只读展示当前复盘；复盘不会影响任务状态、研发交接或收尾。</p>
          </div>
          <button id="task-retrospective-refresh" className="button secondary" type="button" disabled={loading} onClick={onRefresh}>
            刷新复盘
          </button>
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
            <dl className="read-facts retrospective-facts">
              <Fact label="关注范围" value="Agent 执行效率" />
              <Fact label="完成时间" value={formatDateTime(data.slot.result.completedAt)} />
            </dl>
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
