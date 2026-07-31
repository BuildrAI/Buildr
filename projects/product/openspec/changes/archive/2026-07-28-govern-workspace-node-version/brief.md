# Workspace Node 版本治理

## 一句话摘要

让 Buildr Workspace 持有精确、可恢复的 Node toolchain，并让 CLI、npm、验证、Candidate 与 Finish 统一消费同一 Node identity。

## 背景与问题

Buildr 当前只有 `engines.node >=20` 的产品兼容范围，开发入口会从 `BUILDR_NODE` 或 `PATH` 选择任意兼容 Node，验证子进程又可能重新从普通 `PATH` 解析 `npm`。同一任务因此已经出现 CLI 使用 Node 23、正式验证使用 Node 18，而 doctor 仍报告健康、Finish evidence 又无法识别 Node 漂移。

## 目标与非目标

目标是由 Workspace metadata 保存精确版本，由 `init` 准备、`sync` 原版本恢复、`doctor` 只读诊断，并把 Node identity 贯穿 task environment、Verification、Candidate 与 Finish。非目标是不建立通用语言版本管理器、不让 Agent runtime 决定版本，也不改变 `package.json#engines.node` 的兼容性职责。

## 受影响用户与角色

- 在 Buildr Workspace 中执行日常命令、开发和验证的 Agent 与维护者。
- 依赖 Candidate evidence 和 Task Finish 自动收尾的产品开发任务。
- 新建 Workspace 或在本机 Node 被删除后恢复 Workspace 的使用者。

## 核心流程

`init` 使用当前受支持 CLI Node 确定精确版本、写入 Workspace 声明并准备受管 runtime。正常命令只使用该 runtime；runtime 被删除时 `doctor` 报告缺失，`sync` 借用兼容 bootstrap Node 按声明恢复。Verification evidence 记录 Node identity，Finish 只在 identity 匹配时复用。

## 关键变化

- `.buildr/workspace.yml` 增加 `runtime.node.version`。
- Buildr user state 增加按版本与平台隔离的 Node runtime cache。
- launcher、doctor、sync、task environment、verification 和 Finish 使用统一 Node runtime service。
- Node identity 进入公开 evidence 与失效判断。

## 影响、风险与兼容性

首次 init/恢复需要获取并校验 Node 官方发行包；网络失败必须保持声明并可重试。已有 Workspace 需要一次显式 sync migration。旧 Buildr 不理解新增 canonical 字段，因此版本回滚必须连同 metadata 变更一起评估。

## 验收摘要

- PATH 前置 Node 18 时 CLI、npm、测试、Candidate 与 Finish 仍使用 Workspace 声明版本。
- 删除受管 runtime 后 doctor 准确诊断，sync 按原版本恢复且不改声明。
- Node identity 不一致或证据缺失时 Finish 不复用旧验证。
- Agent runtime 不保存、选择或改变 Node version。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs/)
- [Implementation tasks](tasks.md)
