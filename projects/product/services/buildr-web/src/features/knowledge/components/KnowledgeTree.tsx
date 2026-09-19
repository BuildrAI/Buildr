import { useState } from "react";
import {
  CaretRightOutlined,
  CaretDownOutlined,
  FolderOutlined,
  FileOutlined,
} from "@ant-design/icons";
import type { KnowledgeTreeNode } from "../knowledge-tree";
type Props = {
  nodes: KnowledgeTreeNode[];
  onFile: (node: KnowledgeTreeNode) => void;
  label?: string;
};
export function KnowledgeTree({ nodes, onFile, label = "相关文件" }: Props) {
  const marked = (nodes: KnowledgeTreeNode[]): boolean =>
    nodes.some((n) => n.boundary || marked(n.children));
  return (
    <ul className="knowledge-tree" aria-label={label}>
      {nodes.map((node) => (
        <Branch
          key={node.key}
          node={node}
          onFile={onFile}
          depth={0}
          marked={marked(nodes)}
          ancestorBoundary={false}
        />
      ))}
    </ul>
  );
}
function Branch({
  node,
  onFile,
  depth,
  marked,
  ancestorBoundary,
}: {
  node: KnowledgeTreeNode;
  onFile: Props["onFile"];
  depth: number;
  marked: boolean;
  ancestorBoundary: boolean;
}) {
  const folder = node.children.length > 0;
  const [open, setOpen] = useState(
    !ancestorBoundary && !node.boundary && (marked || depth < 2),
  );
  return (
    <li
      className={`knowledge-tree-node${folder ? " directory" : " file"}${open ? " expanded" : ""}${node.boundary ? " business-boundary" : ""}`}
    >
      <div className="knowledge-tree-row">
        {folder ? (
          <button
            className="knowledge-tree-folder"
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <CaretDownOutlined /> : <CaretRightOutlined />}
            <FolderOutlined />
            <span>{node.label}</span>
          </button>
        ) : node.href || node.sourceId ? (
          <button
            type="button"
            className="knowledge-tree-file"
            onClick={() => onFile(node)}
          >
            <FileOutlined />
            <span>{node.label}</span>
          </button>
        ) : (
          <span className="knowledge-tree-label">
            <FolderOutlined />
            {node.label}
          </span>
        )}
        {node.description && (
          <span className="knowledge-tree-description">{node.description}</span>
        )}
      </div>
      {folder && (
        <>
          <button
            type="button"
            tabIndex={-1}
            className="knowledge-tree-rail"
            aria-label={`${open ? "收起" : "展开"} ${node.label}`}
            onClick={() => setOpen(!open)}
          />
          <ul hidden={!open}>
            {node.children.map((child) => (
              <Branch
                key={child.key}
                node={child}
                onFile={onFile}
                depth={depth + 1}
                marked={marked}
                ancestorBoundary={ancestorBoundary || Boolean(node.boundary)}
              />
            ))}
          </ul>
        </>
      )}
    </li>
  );
}
