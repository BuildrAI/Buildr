# 加固 Task Finish 与 Task Environment 边界

## 一句话摘要

修复 Task Finish 持久执行和 task environment execution binding 的安全缺口，并把新 session activation 限定为 runtime 机制专项验收。

## 背景与问题

现有重构已经把任务分流、environment 生命周期和收尾编排分层，但实际审查证明 finish run 可被路径逃逸或空证据推进，lease 接管缺少 fencing，自举 environment 创建后会被创建者 CLI identity 锁住，普通 task create 还残留不必要的 session handoff 提示。用户进一步确认：普通 Rule/Skill 内容修改只需要源资产、render/sync 和 doctor 证据，不应要求当前开发 session 重新加载。

## 目标与非目标

- 目标：fail closed 地保护 run、step evidence、远端 observation、lease 和 CLI execution binding。
- 目标：让普通任务在原对话使用 task environment，无需新 session。
- 目标：只有 runtime discovery/loading/activation 机制专项验收才使用 activation evidence。
- 非目标：不让 Buildr 内省 Agent host，不改变 Git/验证/OpenSpec provider 的专业策略。

## 受影响用户与核心流程

Buildr 开发者和所有使用 Task Finish/task environment 的 Agent 受影响。流程仍是 triage → create/reuse environment → 明确 target/workdir/CLI execution binding → propose/apply/verify → finish；普通流程不加入 session adoption 门禁。

## 关键变化

- Finish run id 限制在 canonical state root。
- Step success 必须具备 fingerprint 和 evidence；push 必须有远端 ref observation。
- Lease completion/release 使用 fencing identity。
- 自举 Workspace 切换到 environment-local CLI；普通 Workspace 显式使用 external-product CLI。
- 普通 Skill 内容修改不触发 activation proof。
- 内置 Skill routing description 在 frontmatter 与 manifests 间保持一致。

## 影响、风险与兼容性

未完成的旧 finish step 可能因缺少新证据而阻塞，需要重新领取；不会自动删除已有 run。普通 task environment 行为更宽松于 session、但更严格于 target/workdir/CLI identity。没有远端或破坏性迁移。

## 验收摘要

路径逃逸、空证据 push、过期 lease 接管、CLI bootstrap、activation identity 与 description drift 都有反例测试；受影响验证、OpenSpec strict 和 doctor 通过。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`
