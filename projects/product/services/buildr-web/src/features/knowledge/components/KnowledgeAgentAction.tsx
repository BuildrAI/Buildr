import { useState } from "react";
import { Alert, Button, Input, Radio, Space } from "antd";
import {
  buildKnowledgeRequest,
  knowledgeScope,
  knowledgeRequestProblem,
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
  const initialize = context.mode === "initialize";
  const construct = context.mode === "construct" || diagram;
  const explore = context.mode === "explore", ask = context.mode === "ask";
  const readOnly = explore || ask;
  const scope = knowledgeScope(context);
  const [input, setInput] = useState<KnowledgeRequest>({
    topic: "",
    coverage: "",
    questions: "",
    request: "",
    exploration: "overview",
  });
  const [prompt, setPrompt] = useState(""),
    [error, setError] = useState(""),
    [copyState, setCopyState] = useState("");
  const problem = knowledgeRequestProblem(context, input);
  const shownPrompt = initialize && !problem ? buildKnowledgeRequest(context, input) : prompt;
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
      setError(e instanceof Error ? e.message : "无法准备指令。");
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shownPrompt);
      setCopyState(readOnly
        ? "已复制；此处尚未执行调查。交给智能体后继续了解，不会自动修改知识内容。"
        : "已复制；此处未执行建设。交给智能体后，刷新查看实际成果。");
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
        {initialize ? `建立${scope?.kind === "service" ? "服务" : "项目"}知识` : explore ? "探索当前项目或服务" : ask ? "追问当前内容" : construct ? (diagram ? "构建技术图" : "构建架构知识") : "完善当前内容"}
      </h2>
      <p className="page-copy">
        {initialize
          ? "先理解整体和主要部分，再沿真实主题继续探索。指令已带上当前范围，可以直接复制给智能体（Agent）。"
          : readOnly
          ? "智能体（Agent）核查最新事实后解释，帮助你理解目标、结构、行为和重要取舍；本次只读回答。"
          : construct
          ? diagram
            ? "描述这张图要解释什么。智能体（Agent）核对事实，选择合适图形，交付图源、图示及依据。"
            : "描述希望长期说明的主题。智能体（Agent）核查规范与代码，选择必要的结构化解释和视图。"
          : "指出哪里不易理解，或希望补充哪些约束、实现位置和修改影响。"}
      </p>
      <p className="page-copy">
        {scope
          ? `当前${scope.kind === "project" ? "项目" : "服务"}：${scope.title}`
          : "当前范围尚未读取完成。"}
      </p>
      {initialize ? <label className="knowledge-field">
        关注点（可选）
        <Input.TextArea aria-label="知识关注点" value={input.questions} maxLength={4000}
          onChange={event => update("questions", event.target.value)} rows={3}
          placeholder="例如：优先帮助新人理解核心业务，或重点解释几个服务如何协作" />
      </label> : explore ? (
        <>
          <div className="knowledge-field">
            <p id="knowledge-exploration-label">从哪里开始</p>
            <Radio.Group aria-labelledby="knowledge-exploration-label" value={input.exploration}
              onChange={(event) => update("exploration", event.target.value)}>
              <Space wrap>
                <Radio value="overview">看全貌</Radio>
                <Radio value="scenario">跟一个场景</Radio>
                <Radio value="part">深入某部分</Radio>
                <Radio value="question">自由提问</Radio>
              </Space>
            </Radio.Group>
          </div>
          {(input.exploration === "scenario" || input.exploration === "part") && <label className="knowledge-field">
            {input.exploration === "scenario" ? "想跟随哪个场景" : "想深入哪个部分"}
            <Input aria-label="探索对象" value={input.topic} maxLength={180}
              onChange={(event) => update("topic", event.target.value)}
              placeholder={input.exploration === "scenario" ? "例如：从提出需求到完成交付" : "例如：任务协作或服务之间的关系"} />
          </label>}
          <label className="knowledge-field">
            {input.exploration === "question" ? "想了解什么" : "还想弄懂什么（可选）"}
            <Input.TextArea aria-label="知识探索问题" value={input.questions} maxLength={4000}
              onChange={(event) => update("questions", event.target.value)}
              placeholder="例如：为什么这样划分职责？有哪些重要取舍？" rows={4} />
          </label>
        </>
      ) : construct ? (
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
          {ask ? "想进一步了解什么" : "希望完善的内容"}
          <Input.TextArea
            aria-label={ask ? "知识追问问题" : "知识修改意见"}
            value={input.request}
            maxLength={4000}
            onChange={(e) => update("request", e.target.value)}
            placeholder={ask ? "例如：这里的职责为什么分开？当前实现还有哪些限制？" : "描述希望改进的解释或需要进一步理解的问题"}
            rows={5}
          />
        </label>
      )}
      {error && <Alert type="error" message={error} />}
      {!initialize && <Space>
        <Button
          type="primary"
          disabled={Boolean(problem)}
          onClick={generate}
        >
          {readOnly ? "生成了解指令" : construct ? "生成建设指令" : "生成完善指令"}
        </Button>
      </Space>}
      {initialize && problem && <Alert type="warning" message={problem} />}
      <p className="page-copy" role="status">
        {shownPrompt
          ? copyState || (readOnly ? "指令已准备；此处尚未执行调查，也未修改知识内容。" : "指令已准备；此处尚未执行知识建设。")
          : readOnly ? "先准备指令，再交给智能体继续了解；此处不会直接执行调查或修改内容。" : "先准备指令，再交给智能体执行；此处不会直接创建成果。"}
      </p>
      {shownPrompt && (
        <section className="knowledge-handoff">
          <label className="knowledge-field">
            可交给智能体的指令
            <Input.TextArea
              aria-label="架构知识指令"
              value={shownPrompt}
              readOnly
              rows={10}
            />
          </label>
          <Button type={initialize ? "primary" : "default"} onClick={() => void copy()}>复制给智能体</Button>
          <p className="page-copy">
            {readOnly ? "保留当前阅读位置，交给智能体回答后继续追问；需要修改长期内容时再选择“完善当前内容”。" : "完成后回到当前知识页刷新，查看实际成果与引用，再继续提出完善意见。"}
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
