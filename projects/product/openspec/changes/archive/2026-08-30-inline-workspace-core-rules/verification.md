# 有界开发验证记录

日期：2026-08-30。任务（Task）：`inline-workspace-core-rules`；变更（Change）：`product/inline-workspace-core-rules`。

执行分支：`codex/inline-workspace-core-rules`，基线提交：`ab8d08773d346c480dbaf2c833bc08685d0e30e6`。使用任务环境返回的 Node.js 24.15.0，在产品服务内执行；临时工作空间及测试包均已清理。

## 已通过

| 验证 | 结果 |
|---|---|
| `test/integration/inline-workspace-core-rules.test.mjs`，经隔离测试运行器执行 | 11/11；最终一轮 62.67 秒 |
| 核心规则、沟通、能力适配、收尾契约与内置退役单元测试，以及诊断和保留环境激活集成测试 | 48/48；最终组合 23.17 秒 |
| `package check` 的 `static,workspace,rules` 选择，经隔离测试运行器执行 | 通过；12 项包含声明、127 个文件 |
| `test/verification/onboarding/init.mjs` | 通过 |
| `test/verification/integrity/managed-data-integrity.mjs` | 通过 |
| `test/verification/workspace/ownership-recovery.mjs` | 通过 |
| 当前变更的 OpenSpec 严格校验与收敛预检 | 通过；无冲突、无场景遗漏，隔离投射严格验证通过 |
| 产品入口技能校验、`git diff --check` | 通过 |

迁移回归验证随包正文与真实发布构建器生成的临时压缩包都包含六条原则；新建及升级后的入口与随包正文一致，区块外字节不变。它还覆盖重复同步、正文漂移检测、缺失/破损/重复标记、普通旧文件删除、缺失回执、未知登记归属、符号链接、已缺失旧文件、未登记旧文件、专业规则登记/启停/引用/移除，以及四个写入故障注入点的整体恢复。

## 修正过的验证问题

- 首轮运行中正文发生变化，使启动时加载的预期正文失效；该轮作废并在稳定正文后重跑。
- 原始源码直接打包不具备正式安装身份，初始化报 `web_profile_identity_invalid`；测试已改用现有应用负载与发布包构建器，真实包回归通过。
- 新增启停测试的局部变量先使用后声明，已修正并完整重跑通过。

## 实现阶段的证明范围

这是实现阶段的有界开发验证，不是正式任务验证结果（Formal Verification Result）。形成此记录时尚无任务候选（Task Candidate）或研发交接（Development Handoff）。受影响范围预览无未映射路径、无实现归属缺口；其完整选择为 55 步，该阶段未执行整套正式验证。

实现阶段结束时清单已完成，变更仍活跃，未收敛归档、提交、推送或发布，规范工作空间保持原基线。用户随后明确授权正式收尾；后续规范归档、正式验证、交付、自举激活和清理以当前任务的专业结果及远端事实为准，本记录不冒充这些后续结论。
