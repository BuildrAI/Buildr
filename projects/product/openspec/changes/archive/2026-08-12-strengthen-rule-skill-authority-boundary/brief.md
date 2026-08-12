# 强化 Rule / Skill 权威边界

## 一句话摘要

让 required Buildr Core 统一规定 Rule 只管价值、边界、约束和结果不变量，专业触发、流程、provider 选择与 Result 分别由 Skill description、Skill/Application、capability binding 和专业 owner 管理。

## 背景与问题

现有 Core 已区分 Rule 与 Skill，也禁止复制若干任务操作手册，但仍允许“项目规则或服务规则”承载具体任务流程。Product `AGENTS.md` 因而积累了 Environment、Verification、OpenSpec convergence、Finish、self-bootstrap 和 release 的命令与顺序，Service Rules 也保留了本地安装、构建和验证命令，与正式 Skills、Applications 和声明文件形成重复 owner，容易漂移。

## 目标与非目标

- 目标：把单一权威边界写入随包 Core，并据此收敛当前自举 workspace 的 root/Product Rules。
- 非目标：不修改现有专业 Skill、capability contract、binding、Application、验证声明或环境声明；不接管独立的人类工作手册。

## 受影响用户或角色

主要影响使用 Buildr workspace 的 Agent 以及维护 Project/Service Rules 的开发者；用户无需学习 capability 名称或手工执行新的流程。

## 核心流程

Agent 先从 Skill description 发现与用户意图匹配的专业入口；需要可替换 provider 时由 capability binding 选择实现；Skill 与 Application 执行流程并产生专业 Result。root、Project 或 Service Rule 只声明当前 scope 的价值、权威/授权边界、约束和最终不变量，必要时可以命名唯一 owner 并禁止绕过，但不复制其 playbook 或状态。

## 关键变化

- Core 明确 Project/Service `AGENTS.md` 不能承担 Skill routing、命令序列、生命周期步骤、重跑/恢复策略、报告模板和专业状态副本。
- Core 允许 Rule 命名 Skill、capability、Application 或 declaration，仅用于声明唯一 owner 与 no-bypass invariant。
- package contract verification 防止旧的“Project/Service Rule 也可承载任务流程”语义回归。
- 自举 root/Product/Service Rules 删除已有正式 owner 的重复流程，保留产品与源码/产物所有权、代码结构约束、禁止事项、授权边界和最终不变量。

## 影响、风险与兼容性

现有 task-environment、task-development、task-verification、OpenSpec/current knowledge、task-finish、self-bootstrap 和 release 能力保持兼容。主要风险是 Rule 精简后 owner 不易发现；由 Skill description 继续负责意图发现，Rule 只保留必要的 owner/no-bypass 边界。

Owner 审计发现一个独立 follow-up：`buildr-release` 的准备发布流程仍保留旧的手工 development CLI 安装、`command -v`、`--help` 和 Doctor 步骤，与 self-bootstrap 唯一 runner 边界不一致。本 Change 不修改发布 Skill 或创建第二 owner；应在发布前通过独立 capability-adaptation 任务收敛该流程。

## 验收摘要

随包 Core 必须包含新的内容边界与 owner 语义，且不再把具体任务流程交给 Project/Service Rules；当前 workspace 的 root/Product/Service `AGENTS.md` 不再复制专业命令或重跑流程；所有删除项均能映射到现有正式 owner，未发现的 gap 必须单独报告。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Buildr package assets delta](specs/buildr-package-assets/spec.md)
- [Tasks](tasks.md)
