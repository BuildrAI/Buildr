## 1. Task Finish 候选模型

- [x] 1.1 扩展 Task Finish run/result/completion identity，增加 `candidateKind` 并允许 code-only 候选的 `change: null`
- [x] 1.2 调整 `task finish run` 参数解析与帮助，使 receipt-bound environment 中 `--project` 必需而 `--change` 条件可选
- [x] 1.3 条件化 preflight/prepare 的 Change tasks、knowledge impact、OpenSpec validation/plan/convergence，并保持其余五阶段保证

## 2. Retained metadata-only 正式交接

- [x] 2.1 更新 `buildr.task-finish/v1` contract 与 Task Finish Skill，定义 retained canonical metadata-only 的精确 Git handoff 和停止边界
- [x] 2.2 为 Task Finish 声明分支条件式 `buildr.git-single-operation/v1` dependency，并同步 package/runtime 投射资产

## 3. 验证覆盖

- [x] 3.1 增加 run identity、nullable Change、completion receipt 与 code-only not-applicable operation 的 unit tests
- [x] 3.2 增加 CLI/contract/fast integration tests，覆盖无 `--change`、普通 Change 兼容和 metadata-only handoff 不混入无关改动
- [x] 3.3 增加真实 code-only task environment product journey，证明五阶段、正式验证、交付与 cleanup 完成且不执行 OpenSpec 命令

## 4. 当前认知与交付资产

- [x] 4.1 创建 Change Brief 和 knowledge impact evidence，并更新 Buildr Service/Change lifecycle 当前认知
- [x] 4.2 更新 CLI reference 与相关实现文档，确保候选分类、条件参数和 handoff 语义一致
- [x] 4.3 运行 workspace sync/doctor，确认 contract、Skill binding 与当前 Codex runtime 投射一致

## 5. 验证

- [x] 5.1 运行 OpenSpec strict validation、proposal contract check 和实现后 current knowledge reconcile/inspect
- [x] 5.2 运行最小与受影响验证，修复发现的问题并确认 code-only/Change 两类回归通过
- [x] 5.3 运行完整 Candidate 验证并记录 candidate identity、Workspace Node identity、耗时与 evidence lifecycle
