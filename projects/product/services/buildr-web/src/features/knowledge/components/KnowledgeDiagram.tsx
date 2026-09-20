import { selectedKnowledgeObject } from "../knowledge-navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "antd";
import { FullscreenOutlined } from "@ant-design/icons";
import { knowledgeDiagramPreviewHeight, type KnowledgeDiagramSize } from "../knowledge-diagram-layout";
export function KnowledgeDiagram({
  src,
  title,
  objects,
  onObject,
  compact = false,
  diagramSize,
}: {
  src: string;
  title: string;
  objects: string[];
  onObject: (id: string) => void;
  compact?: boolean;
  diagramSize?: KnowledgeDiagramSize | null;
}) {
  const host = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLIFrameElement>(null),
    largeFrame = useRef<HTMLIFrameElement>(null),
    [previewWidth, setPreviewWidth] = useState(0),
    [expanded, setExpanded] = useState(false);
  const previewHeight = compact
    ? knowledgeDiagramPreviewHeight(previewWidth, diagramSize)
    : null;
  useEffect(() => {
    if (!compact || !diagramSize || !host.current) return;
    const element = host.current;
    setPreviewWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      setPreviewWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [compact, diagramSize?.width, diagramSize?.height]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const id = selectedKnowledgeObject(
        event,
        (expanded ? largeFrame : frame).current?.contentWindow,
        objects,
      );
      if (id) onObject(id);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [objects, onObject, expanded]);
  return (
    <div ref={host} className={`knowledge-diagram-host${compact ? " is-preview" : ""}${previewHeight !== null ? " has-intrinsic-size" : ""}`}>
      {!compact && (
        <div className="knowledge-diagram-actions">
          <Button
            icon={<FullscreenOutlined />}
            onClick={() => setExpanded(true)}
          >
            放大阅读
          </Button>
        </div>
      )}
      <iframe
        ref={frame}
        className="knowledge-diagram"
        title={title}
        src={src}
        style={previewHeight !== null ? { height: previewHeight } : undefined}
        sandbox="allow-scripts allow-downloads"
        referrerPolicy="no-referrer"
      />
      <Modal
        open={expanded}
        title={title}
        footer={null}
        onCancel={() => setExpanded(false)}
        width="calc(100vw - 40px)"
        style={{ top: 20 }}
        destroyOnHidden
      >
        <iframe
          ref={largeFrame}
          className="knowledge-diagram knowledge-diagram-expanded"
          title={`${title} · 放大`}
          src={src}
          sandbox="allow-scripts allow-downloads"
          referrerPolicy="no-referrer"
        />
      </Modal>
    </div>
  );
}
