import { selectedKnowledgeObject } from "../knowledge-navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "antd";
import { FullscreenOutlined } from "@ant-design/icons";
export function KnowledgeDiagram({
  src,
  title,
  objects,
  onObject,
  compact = false,
}: {
  src: string;
  title: string;
  objects: string[];
  onObject: (id: string) => void;
  compact?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null),
    largeFrame = useRef<HTMLIFrameElement>(null),
    [expanded, setExpanded] = useState(false);
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
    <div className={`knowledge-diagram-host${compact ? " is-preview" : ""}`}>
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
