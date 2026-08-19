## 1. Preflight 对齐观察

- [x] 1.1 在 `task-finish-product-executor` 的 `preflight` 中，复用交付模块既有 Git identity / `ls-remote` 观察，要求 retained 当前符号分支、clean working tree 且 HEAD 等于已观察远端 target ref
- [x] 1.2 落后、分叉、超前、detached 或远端不可观察时 fail closed；区分 behind / diverged 诊断；零 carrier、lease、push 与 activation；不得 fetch、rebase 或写入 working tree
- [x] 1.3 该失败不得进入 `task_finish.entry_gaps`；`deliver` 的 `retained-workspace-not-ready` 精确比对继续保留为第二道防线

## 2. Finish agent 与 CLI

- [x] 2.1 确认并锁定：省略 `--agent` 时 Application 使用 Environment adapter，CLI 不补写 Codex 或会话宿主；传入值与 Environment 不一致时仍走既有 `environment` 入口缺口且不创建 run
- [x] 2.2 更新 `task finish run` 帮助与 CLI Reference：`--agent` 可选，省略跟随 Environment adapter，不得写成必填或默认为 Codex
- [x] 2.3 确认 deliver 执行 retained Doctor 时使用冻结 run agent（Environment adapter）

## 3. Skill

- [x] 3.1 更新 `package/targets/workspace/skills/buildr/task-finish/SKILL.md`：调用前确认 `--agent` 省略或等于 Environment adapter；示例不得把当前聊天宿主写成 Finish `--agent`
- [x] 3.2 保持「未提交或落后先说明、不得新入口缺口码、直接调用 `task finish run`」；产品 preflight 仍对未对齐 fail closed

## 4. 测试、知识与 archive 准备

- [x] 4.1 覆盖 preflight：已对齐通过、落后/分叉/远端不可观察 blocked 且无 delivery mutation；修正假定 behind retained 仍能通过 preflight 的既有 Finish 夹具
- [x] 4.2 覆盖省略 Finish `--agent` 冻结 Environment adapter、传入不一致返回 `environment` 缺口、帮助文案与 Skill 契约
- [x] 4.3 刷新 Brief，评估并收敛受影响 current knowledge（Buildr Service 说明与技术架构中 Finish preflight / Doctor agent）
- [x] 4.4 运行 `openspec validate --strict` 与 convergence preflight，修复本 Change 引入的问题，确认具备 deterministic convergence/archive 条件
