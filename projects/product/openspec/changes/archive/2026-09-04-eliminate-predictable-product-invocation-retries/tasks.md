## 1. 开发 Node 首次选择

- [x] 1.1 扩展 `resolve-development-node`，从显式 `NVM_DIR` 选择 `.node-version` 对应的精确 Node，并保持现有优先级与 fail-closed 行为
- [x] 1.2 更新 Product 验证说明与 Candidate 指引，以 repository-owned npm wrapper 作为 Agent 首选入口
- [x] 1.3 增加 hostile PATH、显式 NVM runtime 与不匹配候选的入口回归测试

## 2. Task Verification writer 首次选择

- [x] 2.1 更新随包 Task Verification Skill 与 capability contract，明确 execution root 和 canonical writer invocation
- [x] 2.2 为 candidate writer rejection 提供 retained Product bridge 恢复提示，同时保持 provenance 零写入保护
- [x] 2.3 增加 Skill contract、CLI diagnostic 与 writer provenance 回归测试

## 3. 当前认知与验证

- [x] 3.1 完成 Brief、knowledge impact 与术语核对；仅更新真实受影响的当前说明
- [x] 3.2 运行 OpenSpec strict、相关 contract/integration tests 和 Product affected verification
- [x] 3.3 基于最终实现执行 current knowledge reconcile，并核对变更范围没有引入 runtime authority、状态机或数据 schema

## 验证结果

- OpenSpec strict、TypeScript typecheck、Node/writer针对性47项测试均通过。
- Product affected verification实际运行；准备`buildr-web`后，先前缺少`web-dist`的三个owner定点重跑通过。
- `managed-mutations`仍指出任务起点中的`project-verification-application.ts`直接文件写入；该文件不在本Change diff中，retained checkout中的并发未交付修订不属于本任务，因此作为独立基线缺口保留。
