export type KnowledgeRequest = {
  topic: string;
  coverage: string;
  questions: string;
  request: string;
};
export function knowledgeScope(context: Record<string, unknown>) {
  const scope = context.scope;
  if (!scope || typeof scope !== "object") return null;
  const value = scope as Record<string, unknown>;
  return ["project", "service"].includes(String(value.kind)) &&
    typeof value.id === "string" &&
    value.id &&
    typeof value.title === "string" &&
    value.title
    ? {
        kind: value.kind as "project" | "service",
        id: value.id,
        title: value.title,
      }
    : null;
}
export function buildKnowledgeRequest(
  context: Record<string, unknown>,
  input: KnowledgeRequest,
): string {
  const scope = knowledgeScope(context);
  if (!scope)
    throw new Error("当前项目或服务尚未读取完成，请返回知识页面重新打开。");
  const diagram =
    context.mode === "diagram" || context.artifactKind === "diagram";
  const map = context.artifactKind === "code-map";
  const construct = context.mode === "construct" || context.mode === "diagram";
  const topic = input.topic.trim(),
    request = input.request.trim();
  if (construct && !topic) throw new Error("请填写想要构建的主题。");
  if (!construct && !request) throw new Error("请描述希望完善的内容。");
  const goal = construct
    ? `请围绕以下用户目标，基于事实源建设${diagram ? "独立技术图。主要交付是回答阅读问题的图源、可查看图示和事实依据；不强制新建架构文章。" : "面向人的项目架构知识。主要交付是能帮助用户理解并掌握项目的架构文章。"}\n主题：${topic}\n关注范围：${input.coverage.trim() || scope.title}\n想弄懂的问题：${input.questions.trim() || "理解职责、关键协作、约束、实现位置及修改影响。"}`
    : `请完善当前${diagram ? "技术图的图源、展示与事实引用" : context.artifactKind === "code-map" ? "代码地图与文件说明" : "架构说明及必要引用"}，帮助用户理解并掌握项目。优先修改既有唯一正文。\n用户意见：${request}`;
  return [
    goal,
    `当前登记范围：${scope.kind === "project" ? "项目" : "服务"}「${scope.title}」。以以下身份和实际工作副本为依据，关注范围只用于进一步限定，不静默扩展到其他项目。`,
    "先重新读取相关规范、代码、登记配置与已有知识，核对当前内容和已观察版本，保留并发修改。先查找适用成果，能完善已有成果时避免重复建设。",
    diagram
      ? "技术图按阅读问题选择关系、流程或时序等合适视角；节点和连线有事实来源，注明范围、图例与表达限制。核对语义和实际视觉结果，保留可维护图源与展示配对。"
      : map
        ? "代码地图说明相关规范、实际职责与协作、真实目录文件及边界，补齐可折叠树和经核实的文件说明；只维护指定地图和实际受影响引用，不强制新建文章。"
        : "文章按阅读问题解释目的、职责与边界、关键协作、重要约束、实现位置及修改影响。当前事实与设计依据要有具体来源；没有证据的设计理由标为推断或待核验，建设建议不能冒充已实现。",
    "采用 current-knowledge-maintenance 组织本次知识建设，按需要使用 Archify、code-map 及术语治理等专业能力；不要求用户选择技能或列出文件，不强制每篇文章凑齐全部图和地图。",
    "用户将本指令交给你后，即请求在指定范围建设这组知识成果。先说明拟交付的具体成果与必要引用，再连续实施，不逐文件重复确认。范围外新主题、业务语义冲突或修改代码/规范承诺，先提出具体影响并取得相应授权；继续其他已授权工作。",
    diagram
      ? "将实际图源、展示与依据写入当前项目或服务知识目录，按当前 knowledge/index.yml 维护必要身份、来源和关联，让图示刷新后出现在技术图列表并能追溯事实。复用适用主题，不为凑文章创建空正文。"
      : map
        ? "将更新后的地图与必要文件说明保存到原位置，维护相关 knowledge/index.yml，验证路径、范围、事实含义和网页阅读。"
        : "将实际文章及必要图、地图写入当前项目或服务的知识目录，保留唯一正文、原生相对链接和事实依据。在已授权范围维护知识入口及必要 knowledge/index.yml，让文章刷新后能从项目知识中找到，并可独立查看引用、追溯来源与继续完善。来源观察只在实际核对后更新。",
    "沿改变的事实检查整组关联：文章解释、技术图关系、代码地图职责与路径、必要术语和阅读入口。只更新实际受影响内容，说明保留项依据；不能只修文章或刷新摘要就宣称整组维护完成。",
    "完成后检查重要事实、引用和适用图示，在网页验证真实成果可读，返回实际成果文件及阅读入口、实际验证和未决点。生成或复制本指令不代表已执行；不要创建假完成状态或空文章占位。",
    "阅读上下文（身份和观察，不是新的事实源）：",
    JSON.stringify(context, null, 2),
  ].join("\n\n");
}
