import { Button, Space } from "antd";

export function KnowledgeInitialize({ kind, onInitialize, onExplore }: {
  kind: "project" | "service";
  onInitialize: () => void;
  onExplore: () => void;
}) {
  const label = kind === "project" ? "项目" : "服务";
  return <section className="knowledge-initialize" data-knowledge-initialize>
    <h2>先建立对{label}的整体认识</h2>
    <p>让智能体（Agent）从代码和已有资料中梳理目标、主要部分与关键过程，形成主题目录，并提供继续探索的方向。</p>
    <Space wrap>
      <Button type="primary" data-knowledge-initialize-action onClick={onInitialize}>建立{label}知识</Button>
      <Button onClick={onExplore}>先了解一下</Button>
    </Space>
    <p className="knowledge-initialize-note">打开后可直接复制指令，也可补充关注点；交给智能体后才开始建设。</p>
  </section>;
}
