## 1. Final Source Convergence

- [x] 1.1 为 release Git owner 增加 matching Task Environment binding 校验，并在 retained primary worktree 或其他 Task worktree 上零写入失败。
- [x] 1.2 实现 current main provenance coverage 检查，区分已由 dev/release evidence 覆盖的发布历史与必须先交付 dev 的独有产品内容。
- [x] 1.3 用保持 pre-reconciliation release tree 不变的双亲历史提交替换工作树 merge，并维护 generation、freeze history 与 reconciliation identity。

## 2. Release Orchestration

- [x] 2.1 将 main coverage/reconciliation 移到完整 Candidate 之前，确保 Candidate、唯一 tarball、carrier 与 readiness 只绑定 final generation。
- [x] 2.2 对 Candidate 后 main 漂移、旧 generation evidence 与错误 PR source 实施 fail-closed currentness 检查。

## 3. Product Assets and Verification

- [x] 3.1 增加连续候选版本历史分叉、main 独有内容、tree-preserving reconciliation、错误 execution root、幂等恢复与 main 漂移的单元/集成测试。
- [x] 3.2 更新 authoritative release Skill、发布检查清单和 current release knowledge，使文档顺序与 owner 行为一致。
- [x] 3.3 完成 OpenSpec/current knowledge 收敛、strict validation 与受影响发布 owner 验证，确认归档前不存在未解决语义或重复 authority。
