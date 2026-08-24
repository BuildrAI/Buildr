## 1. Parent Plan v2 Domain 与兼容读取

- [x] 1.1 实现 v1/v2 closed schema、完整 v2 identity、priority/方向/边界/预计 Child/dependency 校验与 rich compatibility projection
- [x] 1.2 让新 record/reconcile writer 只接受 v2，并通过 current v1 identity 的显式 reconcile 支持升级
- [x] 1.3 扩展 Domain 与 repository round-trip 测试，覆盖 v1 读取、v2 完整表达、missing/self/cycle dependency 与 identity 漂移

## 2. Parent Coordination Application、CLI 与状态投影

- [x] 2.1 从真实 Parent relationship、Child Development binding 与 matching handoff 派生 actual Child，彻底移除预测字段对 disposition/eligibility 的影响
- [x] 2.2 为 work item 输出 expectation、eligibility、actual 三轴与可读 dependency blocker，并覆盖 bound/active/delivered/residual/superseded/unproven
- [x] 2.3 增加 parent-plan/child/ordinary/legacy coordination mode 与紧凑 Child parentSource read model
- [x] 2.4 更新 CLI schema/example、HTTP/Public JSON contract 和 Application/CLI/System 测试
- [x] 2.5 验证 Plan v2 内容变化使旧 Planning Review stale，新 Review/refresh 后恢复 startup 与 eligible

## 3. Buildr Web Parent/Child/普通 Task 概览

- [x] 3.1 重构 Parent panel 类型与局部选择状态，默认展示 outcome、eligible/next、work item 摘要和完整方向
- [x] 3.2 展示 architecture decisions、final acceptance、可读依赖、boundaries、expected Child 与 actual Child 状态
- [x] 3.3 为 Child 增加紧凑 Parent 来源，为 ordinary/legacy 隐藏 Parent 专属大块空态
- [x] 3.4 将 Task Record、schema/digest/storage、Environment 和缺失专业事实移入默认折叠技术区域或既有 Tab
- [x] 3.5 更新样式、稳定 DOM/browser smoke，并构建同步正式 `web-dist`

## 4. Workflow、文档与直接验证反馈

- [x] 4.1 更新随包 Task Development/Task Triage 指引，明确 v2、expected Child 与 actual binding、显式 v1→v2 reconcile 流程
- [x] 4.2 更新 Parent/Child 架构文档与受影响 current knowledge/Brief/术语 evidence
- [x] 4.3 使用等价 fixture 证明 7 个方向、15 条决策与 14 条验收可完整 round-trip，且不修改 live `redesign-release-workflow`
- [x] 4.4 运行受影响 Domain/Application/CLI/Web/browser/package 测试并修复直接反馈
- [x] 4.5 复核 OpenSpec checklist、current knowledge 与最终实现一致，并保持所有文本文件 EOF 合规
