# Task Finish 第二阶段收尾效率优化

## 一句话摘要

把无冲突 Task Finish 中可机械验证的 provider 接力、验证证据清理和 retained CLI 安装收敛为产品连续执行路径，同时保留所有语义与安全停止边界。

## 背景与问题

最近一次真实代码任务的 Task Finish 完成回执记录 535.9 秒端到端耗时，其中正式验证 50.7 秒、产品自动执行 5.6 秒、编排间隙 479.6 秒。流程安全完成，但 13 个 attempt 中多数需要 Agent 手工领取、调用 provider 和提交 evidence；此外 retained CLI 影响分类漏掉 application 源码、production verification lifecycle 与 cleanup consumer 不兼容、安装脚本重新从 shell PATH 选择不受支持 Node，造成额外失败和人工回退。

## 目标与非目标

目标是让具有稳定 product handler 和 result contract 的 provider action 连续执行，统一 evidence lifecycle，正确识别 CLI 实现影响并复用已验证 Node identity，同时让命令帮助直接可执行。非目标是不自动解决语义/Git 冲突、不放宽验证和 cleanup 门禁、不执行 force push 或远端任务分支操作，也不以固定秒数作为正确性标准。

## 受影响用户或角色

- 使用 Task Finish 完成实现、验证、集成和清理的 Agent。
- 维护 Buildr 自举 CLI、verification provider 和 workflow contracts 的产品开发者。
- 依赖 completion receipt 审计耗时、身份和清理结果的 Workspace 维护者。

## 核心流程

Task Finish 解析 action registry 后，连续执行具备产品 handler 的确定 provider action；任一输入、授权、结果或语义边界不满足即停在持久 checkpoint。集成后 retained convergence 依据 canonical Product path 分类入口影响，runtime-install 使用 receipt-bound Node；formal assurance 的 transient evidence 在所有 consumer 完成后由正式 cleanup operation 删除；最终 receipt 报告自动覆盖和剩余 handoff。

## 关键变化

- action registry 增加受限 `provider-executable` 路径。
- verification execute/inspect/cleanup 使用同一 lifecycle schema。
- Buildr Service 生产源码进入默认 CLI 影响政策。
- runtime install 显式绑定 Node/CLI source identity。
- Task Finish 与 worktree 生命周期主题帮助和参数诊断完整化。

## 影响、风险与兼容性

变更横跨 Task Finish、verification、runtime install、CLI help 和 capability assets。旧 verification summary 在边界可证明时兼容清理；未接入 product handler 的 provider 保持原 handoff。主要风险是自动 action 扩大副作用或误清理 evidence，分别由 registry 白名单、原有授权/lease/result contract 和严格目录边界控制。

## 验收摘要

- application domain 源码变化会触发默认 CLI 安装，测试变化不会。
- shell 默认 Node 过旧时，安装仍一次使用 receipt-bound Node 成功。
- production verification transient evidence 可由正式 provider 幂等清理。
- 无冲突 journey 不再要求逐步骤 Agent completion，并在 receipt 中报告覆盖与剩余 handoff。
- help 查询不要求业务参数且返回准确 usage。

实现后的真实临时 Workspace journey 由产品 CLI 创建 Project 与 authoritative verification policy，Task Finish 自动执行 1 次 selected formal provider、在 asset-review 语义边界停止，随后公开 cleanup 删除精确 transient evidence，最终写入 completion receipt；该路径没有 Agent 手工包装或重复启动 verifier。Runtime-install 的独立集成覆盖同时证明 shell 默认 Node 18 被拒绝、同一次调用显式传入 receipt-bound Node 22 后成功安装。Git 内容冲突、资产人工决策、Local App 安装与最终 environment 删除没有稳定无歧义 handler，继续以显式 handoff 计入 `product-partial` coverage，而不伪报全自动。

## 技术 Artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [delta specs](specs/)
