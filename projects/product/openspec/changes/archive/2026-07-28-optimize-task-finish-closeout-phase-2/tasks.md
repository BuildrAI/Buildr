## 1. Verification evidence lifecycle

- [x] 1.1 定义并实现单一 production verification evidence lifecycle schema，使 execute、inspect、Task Finish consumer 与 cleanup 共享 run identity 和目录边界
- [x] 1.2 将 cleanup 从测试 helper 提升为可安装 provider operation，并兼容可证明安全的旧扁平 lifecycle summary
- [x] 1.3 增加 transient、caller-managed、already-absent、legacy-compatible 和 boundary-invalid 的单元及 CLI 集成测试

## 2. Retained impact 与 runtime install

- [x] 2.1 修正 retained path classifier，将 Buildr Service 生产 `src/**/*.mjs` 与入口/安装映射识别为默认 CLI 影响，同时保持测试和未知路径最小副作用
- [x] 2.2 从 retained context 向 runtime-install provider 传递并重验 Node executable、版本、CLI source 和 target identity
- [x] 2.3 覆盖 shell 默认 Node 不受支持、runtime identity 漂移、CLI-only 与 Local-App-only 的集成场景

## 3. Provider action 连续执行

- [x] 3.1 扩展 action registry 和 resolver，只有具备稳定 product handler 与完整 result contract 的 selected provider 才解析为 `provider-executable`
- [x] 3.2 让 safe executor 连续领取、执行和完成确定 provider action，并复用现有 lease、invalidation、observation、diagnostic 与 completion receipt
- [x] 3.3 为 Git、verification、runtime install、asset review 和 cleanup 逐项核对可自动边界；语义分支和未满足条件的 provider 保持显式 handoff
- [x] 3.4 增加正常连续执行、结果缺字段、语义停止、恢复幂等和副作用不重复的 Task Finish 测试

## 4. CLI 可发现性

- [x] 4.1 为 Task Finish 全部 action 与 worktree inspect/cleanup 增加 canonical help topic，并确保 help 在业务参数解析前短路
- [x] 4.2 让未知 action、缺失参数和不适用参数返回稳定错误代码、正确 usage 与可直接执行的 next action
- [x] 4.3 扩展 CLI architecture/public JSON tests，覆盖 `task finish status` 建议、advance help 和 worktree 参数边界

## 5. 产品资产与知识收敛

- [x] 5.1 更新 `buildr.task-finish/v1`、`buildr.task-verification/v2` contract、默认 providers、bindings 与随包 Skills，保持 consumer/provider guarantee 一致
- [x] 5.2 按 knowledge impact 更新 Change Brief 和受影响的 Task Finish/verification 技术架构或流程说明；若无真实 current knowledge 影响则记录 not-applicable
- [x] 5.3 核对 terminology，无新增或重定义时记录 not-applicable，不创建空 glossary 内容

## 6. 验证与效率证据

- [x] 6.1 运行 lifecycle、action registry、runtime install、CLI help 与 worktree 的最小反馈测试
- [x] 6.2 运行真实无冲突 Task Finish journey，证明 provider action coverage、Agent handoff 数、CLI invocation 数、transient cleanup 和 completion receipt
- [x] 6.3 运行 affected assurance、OpenSpec strict/proposal guard、runtime sync/doctor，并在收尾前建立最终 Candidate evidence

## 7. Code review 修订

- [x] 7.1 将 verification cleanup 的 already-absent 语义扩展到公开 CLI 重试，并增加真实重复调用测试
- [x] 7.2 将 formal assurance safe handler 绑定到受支持的 Buildr CLI 调用形态和确定的子命令位置
- [x] 7.3 为 Task Finish action 声明并校验 action-specific 必需参数，统一结构化缺参诊断
- [x] 7.4 补全各 Task Finish action 的完整参数、execution surface、互斥关系和安全副作用帮助
- [x] 7.5 对审查修订运行 focused、affected、OpenSpec、runtime sync/doctor 与最终 Candidate 验证
