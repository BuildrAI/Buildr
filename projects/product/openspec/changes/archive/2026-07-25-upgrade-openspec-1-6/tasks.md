## 1. 上游 1.6.0 集成基线

- [x] 1.1 在 implementation worktree 中将 `@fission-ai/openspec` 和 lockfile 更新到精确的 `1.6.0`，并确认 Node/runtime 与该 release 的 engines 要求兼容。
- [x] 1.2 从精确的 1.6.0 release 读取 workflow templates、CLI surface 和 release behavior，记录将纳入与明确排除的上游能力。
- [x] 1.3 用 executable fixtures 证明 1.6.0 已覆盖 delta parsing、operation conflict、Requirement existence、rebuilt-spec validation 和 MODIFIED scenario preservation，再刷新上游 workflow Skill sources 与 package targets。

## 2. Component 与 Skill 集成

- [x] 2.1 更新 OpenSpec Component、Command collection 和 `openspec-contract-guard` 的版本声明、成员清单和 integrity，使其一致指向 1.6.0。
- [x] 2.2 纳入 `openspec-update-change`，只增加“进入实现前重新执行 task-worktree 决策”的最小 Buildr sidebar。
- [x] 2.3 保留 propose worktree、apply Candidate、proposal gate 和 Task Finish pre/post-sync sidebars；合并或删除 explore、sync、archive 中与上游 status/path context 重复的内容。
- [x] 2.4 更新 package targets、Component integrity 和 composition tests；不为固定 sidebar fragments 新增独立 capability contracts。
- [x] 2.5 明确拒绝将 Stores beta 写入 Component members、Buildr workflow routing、Project assets 或迁移路径。

## 3. 契约与回归验证

- [x] 3.1 从 `openspec-contract-guard` 删除与 1.6.0 重复的 delta parser、单 change merge 和 archive-safety checks，保留 proposal/baseline alignment、canonical drift、active conflict、pre-sync receipt 和 post-sync evidence。
- [x] 3.2 更新 Product tests/fixtures，分别验证上游接管职责和 Buildr 保留职责，确保删除重复逻辑不产生覆盖空洞。
- [x] 3.3 验证版本一致性、Component integrity、sidebar composition、update workflow 的 worktree transition、Stores 排除及现有 capability contracts 不受影响。
- [x] 3.4 使用 OpenSpec 1.6.0 运行 strict validation、status/instructions 和 archive safety 覆盖，并运行受影响的 Component、runtime rendering、contract guard 与 package checks。

## 4. 最终候选与交付

- [x] 4.1 在冻结的 implementation candidate tree 运行 `npm run test:candidate`，记录验证耗时、最慢阶段和结果。
- [x] 4.2 复核 OpenSpec delta 与 canonical specs，建立 baseline 并运行 proposal contract check；在实施完成后按 pre-sync/post-sync 门禁同步并归档。
- [ ] 4.3 按 Buildr 产品发布与 workspace runtime 规则完成集成、必要的 sync/doctor 和交付说明。
