## 1. 交付事实模型

- [x] 1.1 定义逐仓库 delivery evidence 与 delivery/activation/environmentCleanup/diagnostics 正交投影，并兼容读取现有 Finish current/completion。
- [x] 1.2 修复多仓库续跑的 `carrier`/`already-contained` 关系与 proof 原子 checkpoint，补齐历史缺失证明重建。

## 2. Agent 主导的结果收敛

- [x] 2.1 实现 Task Finish delivery reconciliation Application，根据 current handoff、repository set 和真实远端重建交付事实。
- [x] 2.2 增加最小 CLI/Skill 入口，允许 Agent 在外部 Git/PR 交付后收敛结果，不接受 claimed success 或手写 evidence。
- [x] 2.3 让自动 `task finish run` 与 reconciliation 复用同一逐仓库交付判断和 Task terminal 提交逻辑。

## 3. 交付与维护解耦

- [x] 3.1 调整 Task Record 与 terminal delivery projection，在交付成立后提交 completed，并独立展示 activation、Environment cleanup 和 diagnostics attention。
- [x] 3.2 调整 Task Environment cleanup handoff，使其消费可复算 delivery evidence且不改变或撤销 Task 交付终态。
- [x] 3.3 将 Finish execution record open/seal/capacity失败降级为 diagnostics attention，同时保留受控正文与 retention 边界。

## 4. 自举与工作资产

- [x] 4.1 调整 self-bootstrap stable projection、runner和Skill，使其消费 matching delivery result并把失败报告为activation attention。
- [x] 4.2 更新 `task-finish`、`buildr`、`git-operations`、`task-development` 与 capability contract/文档，明确自动路径非唯一入口和 Agent 恢复责任。
- [x] 4.3 更新受影响的 Product brief、architecture、flow、service 与术语当前认知，并保持 runtime 投射源一致。

## 5. 回归与收敛

- [x] 5.1 增加真实多仓库 partial delivery/resume/retained cleanup 回归，覆盖远端未变化、后继包含、分叉和缺失proof重建。
- [x] 5.2 增加外部交付reconciliation、Doctor attention、cleanup attention、execution-record attention与自举激活系统测试。
- [x] 5.3 运行受影响及完整契约/System验证，修复回归并完成OpenSpec strict与convergence readiness检查。
