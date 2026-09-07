import { MarkdownHost } from './MarkdownHost';

export type ChangeArtifact = {
  path: string;
  exists: boolean;
  content?: string;
  capability?: string;
};

export type ChangePayload = {
  name: string;
  brief: ChangeArtifact;
  artifacts: {
    proposal: ChangeArtifact;
    design: ChangeArtifact;
    specs: ChangeArtifact[];
    tasks: ChangeArtifact;
  };
};

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
