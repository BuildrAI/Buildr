import { useEffect, useRef } from "react";
import { Alert, Button, Spin } from "antd";
import { useKnowledgeReading } from "../useKnowledgeReading";
import {
  KnowledgeArtifactReader,
  type ArtifactReaderProps,
} from "./KnowledgeArtifactReader";
import { KnowledgeSource } from "./KnowledgeSource";
import type { KnowledgeScope } from "../api/knowledge-api";
export type KnowledgePane = {
  key: string;
  kind: "artifact" | "source";
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
  reader: Omit<ArtifactReaderProps, "artifact" | "artifacts">;
  onPrimary: (id: string) => void;
  onObserved: (
    key: string,
    observation: NonNullable<KnowledgePane["observation"]>,
  ) => void;
};
export function KnowledgeReadingPane({
  pane,
  scope,
  refresh,
  reader,
  onPrimary,
  onObserved,
}: Props) {
  const result = useKnowledgeReading(
    scope,
    pane.kind === "artifact" ? "artifacts" : "sources",
    pane.id,
    refresh,
  );
  const report = useRef(onObserved);
  report.current = onObserved;
  useEffect(() => {
    if (!result.data) return;
    report.current(pane.key, {
      revision: result.data.revision,
      sources: result.data.observations.map((o) => ({
        id: o.id,
        digest: o.digest,
        status: o.status,
      })),
      artifacts: (result.data.artifacts || []).map((a) => ({
        id: a.id,
        digest: a.digest,
      })),
    });
  }, [result.data]);
  const source = result.data?.observations.find((s) => s.id === pane.id),
    meta = result.data?.index?.sources.find((s) => s.id === pane.id),
    artifact = result.data?.artifacts?.find((a) => a.id === pane.id);
  return (
    <div className="knowledge-side-reader" data-reading-key={pane.key}>
      <p className="knowledge-reading-origin">从「{pane.origin}」打开</p>
      {pane.kind === "artifact" && (
        <Button type="link" onClick={() => onPrimary(pane.id)}>
          在主屏查看 ↗
        </Button>
      )}
      {result.loading ? (
        <Spin />
      ) : result.error ? (
        <Alert type="warning" message={result.error} />
      ) : pane.kind === "source" ? (
        <>
          <h2>{meta?.title || pane.title}</h2>
          <section className="knowledge-file-summary">
            <h3>文件说明</h3>
            <p>
              {meta?.summary ||
                pane.description ||
                "这份来源尚未提供总体说明，可根据源文件补充。"}
            </p>
          </section>
          <p className="knowledge-source-location">
            {source?.location?.title} · {source?.path || meta?.path}
          </p>
          {source &&
            ["changed", "missing", "unreadable"].includes(source.status) && (
              <Alert
                type="warning"
                message={
                  source.diagnostic ||
                  "文件已变化，以上说明需要结合当前内容确认。"
                }
              />
            )}
          {source?.content != null ? (
            <>
              <h3>源文件</h3>
              <KnowledgeSource
                content={source.content}
                path={source.path || ""}
                line={meta?.line}
              />
            </>
          ) : (
            <Alert
              type="warning"
              message={source?.diagnostic || "文件不可读"}
            />
          )}
        </>
      ) : artifact ? (
        <KnowledgeArtifactReader
          {...reader}
          artifact={artifact}
          index={result.data?.index || null}
          artifacts={result.data?.artifacts || []}
        />
      ) : null}
    </div>
  );
}
