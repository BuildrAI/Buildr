# 收敛正式工作流运行时闭环

## 一句话摘要

Buildr 将正式工作流的写入身份绑定到真实 controller，并让 npm artifact 自包含内部入口、紧凑 Verification JSON 和可解释 applicability。

## 背景与问题

当前 application payload root 同时参与资源定位与 SQLite writer provenance，候选源码可能借安装包 payload identity 绕过 retained store 保护。Task Retrospective 和 Task Planning Identity 的受管消费者又依赖 checkout 内部 driver，npm 发布产物无法独立闭环。Verification 公共 JSON 还会重复携带 Execution Record 已保存的大体量输出，`unknown` applicability 缺少原因。

## 目标

- 资源 payload identity 不再影响 writer controller identity。
- npm artifact 自包含 Development、Retrospective 与 Planning Identity hidden routes。
- package、Doctor 和 installed artifact tests 共同保护 consumer/route 闭环。
- Verification JSON 只保留可携带摘要，完整输出只在 Execution Record。
- 未提供 target/declaration identities 时返回稳定 unknown reasons。

## 非目标

- 不迁移历史 Environment Receipt 或推断旧 npm 路径失效根因。
- 不改变 Task lifecycle authority、Verification policy 或 Result 结论。
- 不新增数据库 schema、公共 CLI 或前端交互。

## 核心流程

1. Runtime 分别解析只读 resource root 与实际 writer controller source。
2. 所有 Workspace Structured Store writer 在打开 SQLite 前校验后者。
3. 受管 Skill 从 matching retained controller invocation 进入 bundled `__internal` routes。
4. Package validation、Doctor 和 tarball fixture 校验 route inventory 与真实 Application 调用。
5. Verification 对外只投影 compact checks；完整 stdout/stderr 由 Execution Record 保留。
6. Task Verification inspect 对未提供事实轴返回稳定 reason，仍保持零外部观察。

## 影响、风险与兼容性

主要影响 Buildr npm/CLI、SQLite runtime、Doctor、受管 Skills、Verification 和 Task Verification。合法 npm/retained runtime 与普通用户 Workspace 保持可写；candidate 写 canonical store 更严格地 fail closed。公共 JSON 不改变 schema major，只移除既有契约禁止的 raw output 字段并保留有界失败摘要。

## 验收摘要

- candidate 即使覆盖 payload identity，也不能在拒绝前创建 canonical SQLite/WAL/目录。
- 实际 npm tarball 能独立启动三个 internal workflow routes，并完成 Retrospective/Planning fixture。
- Doctor 能报告 route/consumer closure 漂移。
- Verification JSON 不含 check stdout/stderr，Execution Record 仍保留全文。
- unknown target/declarations axis 均有稳定 reason 且不读取外部来源。

## 技术 Artifacts

- `proposal.md`
- `design.md`
- `specs/workspace-structured-data-store/spec.md`
- `specs/buildr-package-assets/spec.md`
- `specs/agent-task-workflows/spec.md`
- `specs/public-json-contracts/spec.md`
- `specs/task-verification/spec.md`
- `tasks.md`
