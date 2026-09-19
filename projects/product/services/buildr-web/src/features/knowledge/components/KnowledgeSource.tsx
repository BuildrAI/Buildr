import { useEffect, useRef, useState } from "react";
import { Button } from "antd";
import { MarkdownHost } from "../../../components/MarkdownHost";
export function KnowledgeSource({
  content,
  path,
  line,
}: {
  content: string;
  path: string;
  line?: number;
}) {
  const [raw, setRaw] = useState(false),
    focus = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    setRaw(false);
  }, [path]);
  useEffect(() => {
    focus.current?.scrollIntoView({ block: "center" });
  }, [content, line]);
  const markdown = path.endsWith(".md");
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
    <>
      {markdown && (
        <Button size="small" onClick={() => setRaw(!raw)}>
          {raw ? "阅读模式" : "查看原文"}
        </Button>
      )}
      {markdown && !raw ? (
        <MarkdownHost markdown={content} className="markdown-body" />
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
    </>
  );
}
