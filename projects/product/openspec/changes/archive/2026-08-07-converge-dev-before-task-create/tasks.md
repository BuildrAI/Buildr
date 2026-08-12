## 1. 能力边界与规划事实

- [x] 1.1 更新 `task-triage` 的条件化 Git 基线门禁、失败语义与输出契约，保持 Task Record 和 Environment authority 分离
- [x] 1.2 在 workspace Skill manifest 中为 `task-triage` 增加 optional `buildr.git-operations@1` dependency，并核对现有 provider/binding
- [x] 1.3 更新 Git Operations provider/contract 对显式 rebase、冲突 abort 恢复和实际 effects 报告的适用说明

## 2. 产品验证

- [x] 2.1 扩展 package static/contract tests，校验 Skill 文本、dependency graph、source/package/runtime parity 与专业 authority 边界
- [x] 2.2 增加统一 `dev` 创建前门禁的组合 contract fixture，覆盖 aligned、behind、本地未 push 分叉、dirty、错误 branch/upstream、fetch/rebase/abort 失败和多仓部分 effects
- [x] 2.3 运行受影响验证并修复只属于本 Change 的失败

## 3. 当前认知与 Change 收敛

- [x] 3.1 创建并维护 Brief 与 knowledge impact evidence，核对“创建前基线收敛”等术语无需新增第二套 authority
- [x] 3.2 更新受影响 current knowledge，确保任务流程说明与最终 Skill/contract 行为一致
- [x] 3.3 完成 OpenSpec strict validation、Change convergence readiness 与最终差异检查
