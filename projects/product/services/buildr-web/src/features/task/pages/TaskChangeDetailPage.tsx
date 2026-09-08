import { Link, useParams } from 'react-router-dom';
import { Button } from 'antd';
import { useAppShell } from '../../../app/AppShellContext';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { ChangeBriefPanel, type ChangeArtifact as Artifact } from '../../../components/ChangeBriefPanel';
import { workspaceHref } from '../../../lib/labels';
import { useTaskChangeDetail } from '../hooks/useTaskChangeDetail';

function ArtifactPanel({ label, artifact }: { label: string; artifact: Artifact }) {
  return (
    <article className="artifact-panel">
      <div className="artifact-heading">
        <strong>{label}</strong>
        <small>{artifact.path}</small>
      </div>
      {artifact.exists && artifact.content != null ? (
        <MarkdownHost markdown={artifact.content} className="artifact-content markdown-body" options={{ headingOffset: 1, allowRelativeLinks: true }} />
      ) : (
        <p className="artifact-missing">未声明</p>
      )}
    </article>
  );
}

export function TaskChangeDetailPage() {
  const { taskId = '', projectCode = '', changeCode = '' } = useParams();
  const { workspaceId } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const backPath = href(`/tasks/${encodeURIComponent(taskId)}`);

  const { change, provenance, error } = useTaskChangeDetail(taskId, projectCode, changeCode);

  if (error) {
    return (
      <>
        <section className="page-header">
          <p className="eyebrow">任务关联变更</p>
          <h1>变更不可用</h1>
          <p className="page-copy">{error}</p>
        </section>
        <Link to={backPath}><Button>返回任务详情</Button></Link>
      </>
    );
  }

  if (!change) {
    return (
      <section className="page-header change-detail-header">
        <Link className="back-link" to={backPath}>← 返回任务详情</Link>
        <div className="page-header-row">
          <div>
            <p className="eyebrow">任务关联变更</p>
            <h1 id="change-detail-name">正在读取…</h1>
            <p className="page-copy">只读展示当前任务已关联的 OpenSpec 内容。</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="page-header change-detail-header">
        <Link className="back-link" to={backPath}>← 返回任务详情</Link>
        <div className="page-header-row">
          <div>
            <p className="eyebrow">任务关联变更</p>
            <h1 id="change-detail-name">{change.name}</h1>
            <p className="page-copy">只读展示当前任务已关联的 OpenSpec 内容。</p>
          </div>
        </div>
      </section>
      <section id="task-change-provenance" className="panel task-change-provenance">
        <div className="panel-heading">
          <div><h2>读取来源</h2></div>
          <span className="state">只读</span>
        </div>
        <dl id="task-change-provenance-facts" className="read-facts">
          {provenance.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div id="change-brief">
        <ChangeBriefPanel change={change} />
      </div>
      <section className="panel technical-artifacts-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">深入技术细节</p>
            <h2>OpenSpec 产物</h2>
          </div>
          <span className="state">只读</span>
        </div>
        <div id="change-artifacts" className="artifact-list">
          <ArtifactPanel label="提案" artifact={change.artifacts.proposal} />
          <ArtifactPanel label="设计" artifact={change.artifacts.design} />
          {change.artifacts.specs.map((spec) => (
            <ArtifactPanel key={spec.path} label={`规格 · ${spec.capability || spec.path}`} artifact={spec} />
          ))}
          <ArtifactPanel label="任务" artifact={change.artifacts.tasks} />
        </div>
      </section>
    </>
  );
}
