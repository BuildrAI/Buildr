# p1c Task、Finish 与 self-bootstrap 证据关联

## 一句话摘要

为发布 readiness 与受保护 transaction 提供一个只读、可验证、可移植的 Task/Finish/self-bootstrap 证据关联载体。

## 背景与问题

Task Record、Task Environment、Task Development、Task Finish、Execution Record 与 self-bootstrap 各自维护事实；旧 release transaction context 只保存 Task/Environment 的浅投影，无法证明 Finish run、Delivery ref 与 matching Activation 属于同一条身份链。

## 目标与非目标

- 目标：组合 owner identity/digest、支持自动 Finish 与 reconcile、自举结果对账，跨 run/tree 漂移 fail closed。
- 非目标：不建立第二 writer，不复制专业 Result，不实现 release branch、Candidate、publish 或 Git convergence。

## 验收摘要

- 成功关联返回唯一 carrier/context identity 与按 Task 排序的 evidence roles。
- 缺证据或 identity 不一致返回 blocked/unknown，并保留最小诊断引用。
- portable 输出不含完整 stdout、body、SQLite locator 或本地执行路径。

## 技术入口

- `services/buildr/tools/release/release-task-evidence-correlation.mjs`
- `services/buildr/tools/release/release-transaction-evidence.mjs`
