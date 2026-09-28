import { useEffect, useRef, useState } from "react";
import { Alert, Button } from "antd";
import { KnowledgeMarkdown } from './KnowledgeMarkdown';
import { KnowledgeDiagram } from "./KnowledgeDiagram";
import { KnowledgeTree } from "./KnowledgeTree";
import { knowledgeBlocks, relatedFileTree } from "../knowledge-tree";
import { resolveKnowledgePath } from "../knowledge-navigation";
import { markdownHeadingCounts, markdownDocumentBody } from '../../../markdown';
import '../../../components/markdown-reader.css';
import type {
  KnowledgeResponse,
  KnowledgeScope,
  KnowledgeIndex,
  KnowledgeReference,
} from "../api/knowledge-api";
type Artifact = NonNullable<KnowledgeResponse["artifacts"]>[number];
export type ArtifactReaderProps = {
  artifact: Artifact;
  artifacts: Artifact[];
  index: KnowledgeIndex | null;
  workspaceId: string;
  scope: KnowledgeScope;
  onLink: (base: string, href: string) => void;
  onFile: (base: string, href: string, description?: string) => void;
  onSource: (id: string) => void;
  onOpen: (id: string) => void;
  onObject: (id: string) => void;
  onReference: (reference: KnowledgeReference, title: string, fragment?: string) => void;
  reference?: KnowledgeReference;
  embedded?: boolean;
  showTitle?: boolean;
  preserveHeading?: boolean;
  stack?: string[];
};
export function KnowledgeArtifactReader(props: ArtifactReaderProps) {
  const {
    artifact: a,
    artifacts,
    index,
    scope,
    workspaceId,
    embedded = false,
    showTitle = true,
    stack = [a.id],
  } = props;
  const current = useRef(props);
  const [raw, setRaw] = useState(false);
  useEffect(() => setRaw(false), [a.path]);
  current.current = props;
  const body = markdownDocumentBody(a.content || '', !props.preserveHeading && a.kind !== 'diagram');
  let headingCounts: Record<string, number> = body.headingCounts;
  const markdown = (text: string, key: string) => {
    const initialHeadings = headingCounts;
    headingCounts = markdownHeadingCounts(text, headingCounts);
    return (
    <KnowledgeMarkdown
      key={key}
      content={text} path={a.path || ''} workspaceId={workspaceId} scope={scope}
      headingCounts={initialHeadings}
      reference={props.reference || { kind: 'artifact', id: a.id, links: [] }}
      onReference={props.onReference}
      onLink={href => {
        const path = resolveKnowledgePath(a.path || '', href);
        if (!index?.artifacts.some(item => item.path === path) && !index?.sources.some(item => (item.link || item.path) === path)) return false;
        current.current.onLink(a.path || '', href);
        return true;
      }}
    />
    );
  };
  const content = body.content;
  const title =
    a.kind === "diagram"
      ? "技术图（Technical Diagram）"
      : a.kind === "code-map"
        ? "代码地图（Code Map）"
        : a.kind === "terms"
          ? "术语解释"
          : "架构知识";
  const fileNodes = relatedFileTree(
    (a.files || []).flatMap((id) => {
      const s = index?.sources.find((s) => s.id === id);
      return s ? [{ ...s, path: s.link || s.path }] : [];
    }),
  );
  const facts = index?.sources.filter((s) => a.sources.includes(s.id)) || [];
  // One method may have several cited files; the skill detail owns that navigation.
  const methods = [...new Map(facts.filter(s => s.kind === "skill").map(s => [s.skillId || s.id, s])).values()]
    .map(s => facts.find(candidate => candidate.kind === "skill" && candidate.skillId === s.skillId && candidate.path === "SKILL.md") || s);
  return (
    <article
      className={`${embedded ? "knowledge-embedded" : "knowledge-artifact"}${a.kind === "code-map" ? " knowledge-code-map" : ""}`}
      data-knowledge-artifact={a.id}
    >
      {body.anchor && <span id={body.anchor} className="knowledge-document-anchor" aria-hidden />}
      {(embedded || (showTitle && a.kind !== "diagram")) && (
        <header>
          <div>
            <small>{title}</small>
            <h2>{a.title}</h2>
          </div>
          {embedded && (
            <Button type="link" onClick={() => props.onOpen(a.id)}>
              独立查看 ↗
            </Button>
          )}
        </header>
      )}
      {!embedded && !props.preserveHeading && a.kind !== 'diagram' && <div className="markdown-reader-toolbar"><span>{a.path}</span><Button type="text" size="small" aria-pressed={raw} onClick={() => setRaw(value => !value)}>{raw ? '阅读模式' : '查看原文'}</Button></div>}
      {a.diagnostic ? (
        <Alert type="warning" message={a.diagnostic} />
      ) : raw ? (
        <pre className="markdown-reader-source">{a.content}</pre>
      ) : a.kind === "diagram" ? (
        <KnowledgeDiagram
          src={`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/knowledge/${scope.kind}/${encodeURIComponent(scope.id)}/artifacts/${encodeURIComponent(a.id)}/view?v=${a.digest}${embedded ? "&embed=1" : ""}`}
          title={a.title}
          compact={embedded}
          diagramSize={a.diagramSize}
          objects={a.objects}
          onObject={props.onObject}
        />
      ) : (
        content.split(/(!\[[^\]]*\]\([^)]+\))/g).map((chunk, i) => {
          const match = chunk.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
          if (match) {
            const linked = artifacts.find(
              (item) =>
                item.path === resolveKnowledgePath(a.path || "", match[2]),
            );
            if (!linked) return markdown(chunk, String(i));
            return !stack.includes(linked.id) ? (
              <KnowledgeArtifactReader
                key={linked.id}
                {...props}
                artifact={linked}
                reference={undefined}
                embedded
                preserveHeading={false}
                stack={[...stack, linked.id]}
              />
            ) : (
              <Alert
                key={i}
                type="warning"
                message="引用成果未纳入当前阅读范围，或包含循环引用。"
              />
            );
          }
          if (a.kind !== "code-map") return markdown(chunk, String(i));
          return knowledgeBlocks(chunk).map((block, j) =>
            block.kind === "markdown" ? (
              markdown(block.text, `${i}:${j}`)
            ) : (
              <KnowledgeTree
                key={`${i}:${j}`}
                nodes={block.nodes}
                label="事实与实现文件"
                onFile={(node) =>
                  props.onFile(a.path || "", node.href || "", node.description)
                }
              />
            ),
          );
        })
      )}
      {a.graph && ["missing", "unreadable"].includes(a.graph.status) && (
        <Alert
          type="warning"
          message={a.graph.status === "missing" ? "图源文件缺失" : "图源文件暂时不可读"}
          description={a.graph.diagnostic}
        />
      )}
      {a.kind === "diagram" && !embedded && (
        <section className="knowledge-artifact-files">
          <h2>图示文件</h2>
          {fileNodes.length ? (
            <KnowledgeTree
              nodes={fileNodes}
              onFile={(n) => n.sourceId && props.onSource(n.sourceId)}
            />
          ) : (
            <p className="page-copy">尚未登记可阅读的图示文件。</p>
          )}
          {facts.some((s) => s.kind !== "skill") && (
            <>
              <h3>关联的规范与实现</h3>
              <KnowledgeTree
                nodes={relatedFileTree(facts.filter((s) => s.kind !== "skill"))}
                onFile={(n) => n.sourceId && props.onSource(n.sourceId)}
              />
            </>
          )}
          {methods.length > 0 && (
            <section className="knowledge-methods" aria-label="建设方法">
              <h3>建设方法</h3>
              <div className="knowledge-method-list">
                {methods.map(s => <button key={s.skillId || s.id} type="button" className="knowledge-method" onClick={() => props.onSource(s.id)}>
                  <strong>{s.title}</strong>
                  <span>{s.summary || "查看适用范围、执行方法与完成标准"}</span>
                  <span className="knowledge-method-open" aria-hidden>↗</span>
                </button>)}
              </div>
            </section>
          )}
        </section>
      )}
    </article>
  );
}
