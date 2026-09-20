import { useEffect, useRef, useState } from "react";
import { Button } from "antd";
import { KnowledgeArtifactReader, type ArtifactReaderProps } from './KnowledgeArtifactReader';
export function KnowledgeSource({
  content,
  path,
  line,
  sourceId,
  reading,
}: {
  content: string;
  path: string;
  line?: number;
  sourceId: string;
  reading: ArtifactReaderProps;
}) {
  const [raw, setRaw] = useState(false),
    focus = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    setRaw(false);
  }, [path]);
  useEffect(() => {
    focus.current?.scrollIntoView({ block: "center" });
  }, [content, line, raw]);
  const markdown = path.toLowerCase().endsWith(".md");
  const color = /\.[cm]?[jt]sx?$/.test(path);
  const tokens = (value: string) =>
    !color
      ? value
      : value
          .split(
            /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*|\b(?:import|from|export|function|return|const|let|if|else|try|catch|throw|async|await|type|interface|class|new|null|true|false)\b)/g,
          )
          .map((part, i) => (
            <span
              key={i}
              className={
                /^["']/.test(part)
                  ? "knowledge-token-string"
                  : part.startsWith("//")
                    ? "knowledge-token-comment"
                    : /^\w+$/.test(part)
                      ? "knowledge-token-keyword"
                      : undefined
              }
            >
              {part}
            </span>
          ));
  return (
    <div data-knowledge-source={sourceId}>
      {markdown && (
        <Button size="small" onClick={() => setRaw(!raw)}>
          {raw ? "阅读模式" : "查看原文"}
        </Button>
      )}
      {markdown && !raw ? (
        <div data-rendered-source><KnowledgeArtifactReader {...reading} showTitle={false} preserveHeading /></div>
      ) : (
        <pre className="knowledge-source" aria-label="只读来源">
          {content.split("\n").map((text, i) => (
            <span
              key={i}
              ref={i + 1 === line ? focus : undefined}
              className={i + 1 === line ? "knowledge-source-focus" : undefined}
            >
              <b>{i + 1}</b>
              {tokens(text)}
              {"\n"}
            </span>
          ))}
        </pre>
      )}
    </div>
  );
}
