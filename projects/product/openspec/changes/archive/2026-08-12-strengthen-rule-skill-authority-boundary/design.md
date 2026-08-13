## Context

当前 canonical Core 位于 Buildr package target，retained workspace 的 `rules/buildr/core.md` 是自举同步后的派生副本。Core 已区分 Rule 与 Skill，也禁止复制若干任务操作手册，但末尾仍写着“具体任务流程由对应 Skill、项目规则或服务规则承载”，这给 Project/Service `AGENTS.md` 留出了流程权威入口。`projects/product/AGENTS.md` 因而长期积累了 Environment、Verification、OpenSpec convergence、Finish、self-bootstrap 和 release 的具体命令与顺序；两个 Service Rules 也保留了本地安装、构建、验证命令，与正式 Skills/Application/declarations 形成重复 owner。

现有专业 owner 已覆盖这些流程；本变更不需要新 Skill 或 capability adaptation。自举 workspace 还有一个人类可读手册 worktree，但该手册不能成为 Agent 操作流程 authority，本任务不修改或集成它。

## Goals / Non-Goals

**Goals:**

- 让所有 Buildr workspace 都从 required Core 获得一致的 Rule/Skill 单一权威边界。
- 让 root、Project 和 Service `AGENTS.md` 只承载 scope-specific 约束与结果不变量。
- 保留 Rule 指向正式 owner 的能力，但禁止 Rule 复制 owner 的流程或状态。
- 收敛当前自举 workspace 的重复规则，并用 package verification 防止 Core 回退。

**Non-Goals:**

- 不修改任何 Skill 正文、capability contract、binding 或 Application 状态模型。
- 不重构 Environment、Verification、Finish、OpenSpec、self-bootstrap 或 release 流程。
- 不把 owner 映射表写成新的长期路由表。
- 不处理 `write-buildr-agent-working-manual` worktree，也不让人类手册成为 Agent playbook authority。

## Decisions

1. **只修改 package target 中的 canonical Core。** 候选不直接编辑 retained `rules/buildr/core.md`；正式 Finish 后由 self-bootstrap 的唯一 runner 同步 retained workspace。这样 package source 仍是产品事实 authority，自举副本不会成为第二 source。
2. **用内容类型界定 Rule，而不是列举允许的 Skill。** Core 明确允许的内容是价值观、权威边界、授权边界、约束和结果不变量；明确禁止的是 Skill routing、命令序列、生命周期步骤、重跑/恢复策略、报告模板和专业状态/Result 副本。新增专业能力无需再更新一张 Rule 路由表。
3. **Rule 只可声明 owner，不可编排 owner。** `AGENTS.md` 可以命名 Skill、capability、Application 或 declaration，表达“这是唯一 owner”“不得绕过”；具体触发由 Skill description 负责，provider 选择由 binding 负责，流程与完成证据由 Skill/Application 负责。
4. **只删除已有正式 owner 的重复流程。** Product Rule 中 Environment/worktree、Verification、OpenSpec convergence、Finish、self-bootstrap 和 release 的命令/顺序，以及 Service Rules 中本地安装、构建和验证命令，均已有正式 owner；若实施时发现未覆盖流程，只记录为 gap，不在本任务内复制到另一个文档或扩展 Skill。
5. **测试 Core 契约，不建立全仓 Rule 文案 lint。** package contract test 断言 required Core 包含新的正向边界并移除“项目规则或服务规则承载任务流程”的旧语义。Project/Service Rules 的具体收敛通过本 Change、strict OpenSpec validation 与 changed tests 验证，避免脆弱的自然语言全仓扫描。

## Risks / Trade-offs

- [Rule 过度精简后 owner 不易发现] → Skill description 继续承担意图发现；Rule 可保留唯一 owner 与禁止绕过的结果约束，但不复制操作步骤。
- [删除流程时误删产品边界] → 逐条先建立当前 owner 映射，只删除命令、顺序、重跑和报告细节；产品/Service ownership、禁止事项、授权边界和不变量保留。
- [canonical Core 与 retained 副本短暂不一致] → 候选验证 package source，正式 Finish 后只由 self-bootstrap runner 完成 package sync、入口验证和最终 Doctor。
- [人类手册再次复制 Agent 流程] → 本任务不接管该 worktree；其后续集成必须只保留高层说明，并按新 Core 边界单独审查。
