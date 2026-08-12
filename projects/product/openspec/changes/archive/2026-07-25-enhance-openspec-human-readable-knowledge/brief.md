# OpenSpec 人类可读变更与当前认知治理

## 一句话摘要

在 OpenSpec 1.6.0 规范工作流之上增加面向人的 Change Brief，并让每次 Change 按真实影响持续维护 Project 当前认知和统一术语。

## 背景与问题

Proposal、design、delta specs 和 tasks 能可靠约束实现，但普通用户需要自行拼接这些技术产物才能理解 Change。Project 当前事实又集中在单一文档中，缺少按产品架构、技术架构、核心流程、Service 和术语持续维护的机制。

## 目标与非目标

目标是提供稳定 Brief、结构化 current knowledge、术语治理/current knowledge capability contracts、OpenSpec lifecycle 门禁和 Local App 人类优先 Change 详情。非目标是不修改 OpenSpec 上游 schema/Skills、不生成空知识文档、不建立 Organization glossary，也不让 Buildr 接管 Agent 的理解、检索、推理和任务执行。

## 受影响用户与角色

- 普通用户：先读 Brief 理解 Change，再按需进入技术 artifacts。
- 产品与架构维护者：通过当前认知和 glossary 维护长期事实与共同语言。
- Agent：从受治理 Work Assets 和其他授权来源形成 Task Context，并返回可核验的知识维护 evidence。
- Buildr 维护者：通过 capability contracts 和 Component contributions 保持 OpenSpec 上游可升级。

## 核心流程

1. Explore 可选进行术语对齐。
2. Propose 创建标准 artifacts、Brief，并 assess 真实知识影响。
3. Apply 实现代码与知识任务，在最终验证前 reconcile。
4. Sync/Task Finish inspect evidence；任何内容修订都使旧验证 evidence 失效。
5. Archive 只移动已经对齐的 Change、Brief 和 sidecar，不在归档后补写 current knowledge。

## 关键变化

- 新增 `buildr.terminology-governance/v1` 与 `buildr.current-knowledge-maintenance/v1`。
- 新增 Project knowledge 信息架构和 Change `brief.md` companion artifact。
- 明确四层模型：Work Information Space；Workspace/Work Assets/Shared Work Environment；Task Context；Context Window。
- 明确 Workspace 是范围和发现入口，位于 Workspace 不等于被 Buildr 治理。
- Change read model 和 Local App 增加 Brief，并先展示人类理解入口。

## 影响、风险与兼容性

旧 Change 没有 Brief 时继续读取标准 artifacts；新 capability dependency 缺失时 required consumers fail closed，Explore 仅 degraded。Brief/current knowledge 可能漂移的风险由 reconcile、inspect 与最终验证前门禁控制。本变更无破坏性 API 删除。

## 验收摘要

- OpenSpec consumers 不修改上游 Skill source，并通过 capability binding 与 Component contribution 组合。
- Brief、impact sidecar 和结构化 current knowledge 可自举维护。
- Context/Task Context/Context Window 与 Workspace/Work Asset 边界在 specs、glossary 和产品说明中一致。
- active/archived Change 均能安全返回 Brief availability，Local App 先展示 Brief。
- affected 与最终 Candidate 验证通过，knowledge inspect 无 unresolved items。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta Specs](specs/)
- [Tasks](tasks.md)

