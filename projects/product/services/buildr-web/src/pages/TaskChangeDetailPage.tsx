import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'antd';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { MarkdownHost } from '../components/MarkdownHost';
import { workspaceHref } from '../lib/labels';

type WorkspacePayload = { rootPath: string; workspace: { name: string } };

type Artifact = {
  path: string;
  exists: boolean;
  content?: string;
  capability?: string;
};

export type ChangePayload = {
  name: string;
  brief: Artifact;
  artifacts: {
    proposal: Artifact;
    design: Artifact;
    specs: Artifact[];
    tasks: Artifact;
  };
};

type ChangeDetailResponse = {
  resolution: {
    workingCopy: { provenance: string; root: string; change: ChangePayload };
    retainedBaseline: { provenance: string; root: string } | null;
  };
};

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

export function ChangeBriefPanel({ change }: { change: ChangePayload }) {
  return (
    <section className="panel change-brief-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">关联变更</p>
          <h2>{change.name}</h2>
        </div>
        <span className="state">{change.brief.exists ? 'Brief' : 'Brief 未提供'}</span>
      </div>
      {change.brief.exists && change.brief.content != null ? (
        <MarkdownHost markdown={change.brief.content} className="brief-content markdown-body" options={{ headingOffset: 1, allowRelativeLinks: true }} />
      ) : (
        <p className="brief-missing">{`没有可读取的 Brief：${change.brief.path}`}</p>
      )}
    </section>
  );
}

export function TaskChangeDetailPage() {
  const { taskId = '', projectCode = '', changeCode = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const backPath = href(`/tasks/${encodeURIComponent(taskId)}`);

  const [change, setChange] = useState<ChangePayload | null>(null);
  const [provenance, setProvenance] = useState<Array<[string, string]>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, data] = await Promise.all([
          api('/api/v1/workspace') as Promise<WorkspacePayload>,
          api(`/api/v1/tasks/${encodeURIComponent(taskId)}/changes/${encodeURIComponent(projectCode)}/${encodeURIComponent(changeCode)}`) as Promise<ChangeDetailResponse>,
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        const next = data.resolution.workingCopy.change;
        setChange(next);
        setProvenance([
          ['工作副本', `${data.resolution.workingCopy.provenance} · ${data.resolution.workingCopy.root}`],
          ['保留基线', data.resolution.retainedBaseline
            ? `${data.resolution.retainedBaseline.provenance} · ${data.resolution.retainedBaseline.root}`
            : '无独立保留基线'],
        ]);
        setBreadcrumbParts([workspace.workspace.name, '任务', taskId, '变更', next.name]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '变更不可用');
      }
    })();
    return () => { cancelled = true; };
  }, [taskId, projectCode, changeCode, setWorkspace, setBreadcrumbParts]);

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
