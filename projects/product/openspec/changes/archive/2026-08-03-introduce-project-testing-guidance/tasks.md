## 1. Skill 与声明指导

- [x] 1.1 新增无状态 `project-testing` Skill、三轴测试模型 reference 和 Workspace manifest entry
- [x] 1.2 更新产品入口、task-triage 与 `task-verification`，分离测试建设和 capability declaration / execution / Result authority
- [x] 1.3 为 Node.js 与 Java 提供非强制的轻量技术栈映射，并保留 Acceptance 第一版占位边界

## 2. 产品资产验证

- [x] 2.1 更新 package、builtin/runtime parity 与 Skill contract 测试，证明新 Skill 可安装、投射且没有 capability binding
- [x] 2.2 验证 `task-verification` reference/template 与 `buildr.project-verification/v2` schema 保持兼容且无新增分类字段

## 3. 规格与当前认知

- [x] 3.1 严格校验 delta specs，并确认 canonical specs 只由最终 `openspec converge` 事务同步
- [x] 3.2 更新 glossary、overview、Buildr Service 与验证实践文档，完成 current knowledge reconcile

## 4. 候选验证与收敛

- [x] 4.1 执行受影响的 unit、contract、package/runtime parity、文档与 OpenSpec 验证
- [x] 4.2 主动审查边界、测试与 runtime 投射，修复同一 Change 内问题
- [x] 4.3 冻结实现候选并执行完整 Candidate；retained runtime sync 与 Doctor 由后续 Task Finish 交付阶段完成
