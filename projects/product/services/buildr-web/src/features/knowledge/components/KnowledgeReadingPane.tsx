import { Button } from 'antd';
import type { ArtifactReaderProps } from './KnowledgeArtifactReader';
import { KnowledgeBrowser } from './KnowledgeBrowser';
import type { KnowledgeIndex, KnowledgeScope } from '../api/knowledge-api';

export type KnowledgePane = {
  key: string;
  kind: 'artifact' | 'source';
  id: string;
  title: string;
  origin: string;
  description?: string;
  observation?: {
    revision: string | null;
    sources: { id: string; digest: string | null; status: string }[];
    artifacts: { id: string; digest: string | null }[];
  };
};
type Props = {
  pane: KnowledgePane;
  scope: KnowledgeScope;
  refresh: number;
  reader: Omit<ArtifactReaderProps, 'artifact' | 'artifacts'>;
  onPrimary: (id: string) => void;
  onIndex: (index: KnowledgeIndex) => void;
  onObserved: (key: string, observation: NonNullable<KnowledgePane['observation']>) => void;
};

/** Project side reading uses the same source/artifact renderer and local history as every other entry. */
export function KnowledgeReadingPane({ pane, scope, refresh, reader, onPrimary, onIndex, onObserved }: Props) {
  return <div className="knowledge-side-reader" data-reading-key={pane.key}>
    <p className="knowledge-reading-origin">从「{pane.origin}」打开</p>
    {pane.kind === 'artifact' && <Button type="link" onClick={() => onPrimary(pane.id)}>在主屏查看 ↗</Button>}
    <KnowledgeBrowser workspaceId={reader.workspaceId} scope={scope} refresh={refresh}
      initialArtifactId={pane.kind === 'artifact' ? pane.id : undefined}
      initialSourceId={pane.kind === 'source' ? pane.id : undefined}
      sourceDescription={pane.description}
      onObserved={data => {
        if (data.index) onIndex(data.index);
        onObserved(pane.key, {
          revision: data.revision,
          sources: data.observations.map(item => ({ id: item.id, digest: item.digest, status: item.status })),
          artifacts: (data.artifacts || []).map(item => ({ id: item.id, digest: item.digest })),
        });
      }}
    />
  </div>;
}
