import { useState } from "react";
import { Alert, Button, Input, Space } from "antd";
import {
  buildKnowledgeRequest,
  knowledgeScope,
  type KnowledgeRequest,
} from "../knowledge-request";
export function KnowledgeAgentAction({
  context,
  onBack,
}: {
  context: Record<string, unknown>;
  onBack: () => void;
}) {
  const diagram = context.mode === "diagram";
  const construct = context.mode === "construct" || diagram;
  const scope = knowledgeScope(context);
  const [input, setInput] = useState<KnowledgeRequest>({
    topic: "",
    coverage: "",
    questions: "",
    request: "",
  });
  const [prompt, setPrompt] = useState(""),
    [error, setError] = useState(""),
    [copyState, setCopyState] = useState("");
  const update = (field: keyof KnowledgeRequest, value: string) => {
    setInput((current) => ({ ...current, [field]: value }));
    setPrompt("");
    setError("");
    setCopyState("");
  };
  const generate = () => {
    try {
      setPrompt(buildKnowledgeRequest(context, input));
      setError("");
      setCopyState("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法准备建设指令。");
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("已复制；此处未执行建设。交给智能体后，刷新查看实际成果。");
    } catch {
      setCopyState("自动复制失败，请在下方选择指令手动复制；尚未执行。");
    }
  };
  return (
    <div className="knowledge-action">
      <Button type="link" onClick={onBack}>
        ← 返回
      </Button>
      <h2>
        {construct ? (diagram ? "构建技术图" : "构建架构知识") : "完善当前内容"}
      </h2>
      <p className="page-copy">
        {construct
          ? diagram
            ? "描述这张图要解释什么。智能体（Agent）核对事实，选择合适图形，交付图源、图示及依据。"
            : "描述你想理解的主题。智能体（Agent）调查规范与代码，形成文章，并按需要引用图和代码地图。"
          : "指出哪里不易理解，或希望补充哪些约束、实现位置和修改影响。"}
      </p>
      <p className="page-copy">
        {scope
          ? `当前${scope.kind === "project" ? "项目" : "服务"}：${scope.title}`
          : "当前范围尚未读取完成。"}
      </p>
      {construct ? (
        <>
          <label className="knowledge-field">
            想构建什么主题
            <Input
              aria-label="知识主题"
              value={input.topic}
              maxLength={180}
              onChange={(e) => update("topic", e.target.value)}
              placeholder="例如：项目、服务与代码库如何协作"
            />
          </label>
          <label className="knowledge-field">
            关注范围（可选）
            <Input
              aria-label="知识关注范围"
              value={input.coverage}
              maxLength={500}
              onChange={(e) => update("coverage", e.target.value)}
              placeholder={`默认当前${scope?.kind === "service" ? "服务" : "项目"}，也可限定某个模块或流程`}
            />
          </label>
          <label className="knowledge-field">
            想弄懂哪些问题（可选）
            <Input.TextArea
              aria-label="知识阅读问题"
              value={input.questions}
              maxLength={4000}
              onChange={(e) => update("questions", e.target.value)}
              placeholder="例如：各自承担什么职责？从哪里找到代码？改变关联会影响什么？"
              rows={4}
            />
          </label>
        </>
      ) : (
        <label className="knowledge-field">
          希望完善的内容
          <Input.TextArea
            aria-label="知识修改意见"
            value={input.request}
            maxLength={4000}
            onChange={(e) => update("request", e.target.value)}
            placeholder="描述希望改进的解释或需要进一步理解的问题"
            rows={5}
          />
        </label>
      )}
      {error && <Alert type="error" message={error} />}
      <Space>
        <Button
          type="primary"
          disabled={
            !scope || !(construct ? input.topic.trim() : input.request.trim())
          }
          onClick={generate}
        >
          {construct ? "生成建设指令" : "生成完善指令"}
        </Button>
      </Space>
      <p className="page-copy" role="status">
        {prompt
          ? copyState || "指令已准备；此处尚未执行知识建设。"
          : "先准备指令，再交给智能体执行；此处不会直接创建成果。"}
      </p>
      {prompt && (
        <section className="knowledge-handoff">
          <label className="knowledge-field">
            可交给智能体的指令
            <Input.TextArea
              aria-label="架构知识指令"
              value={prompt}
              readOnly
              rows={10}
            />
          </label>
          <Button onClick={() => void copy()}>复制给智能体</Button>
          <p className="page-copy">
            完成后回到当前知识页刷新，查看实际成果与引用，再继续提出完善意见。
          </p>
        </section>
      )}
      <details>
        <summary>本次阅读上下文</summary>
        <pre className="knowledge-context">
          {JSON.stringify(context, null, 2)}
        </pre>
      </details>
    </div>
  );
}
