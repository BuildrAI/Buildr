## 1. Task Finish 安全边界

- [x] 1.1 为 finish run id 增加格式与 canonical path containment 校验，并补路径逃逸测试。
- [x] 1.2 为 step completion 增加 fingerprint/evidence 与 integration-push ref observation 门禁，并补缺失证据回归测试。
- [x] 1.3 为共享 lease 增加 owner/token/expiry fencing，确保旧 holder 不会删除新 lease，并补接管回归测试。

## 2. Task Environment 执行与 activation 边界

- [x] 2.1 实现自举 environment-local 与普通 external-product 两类 CLI source identity，修复 create 后 checkout-local CLI 自锁。
- [x] 2.2 让普通 create/reuse 不返回 handoff/adopt next action，并把 activation 验收限定为 runtime discovery/loading/activation 机制变更。
- [x] 2.3 让专项 activation evidence 同时匹配规范化 session root 与 handle，并补 mismatch 测试。

## 3. Skill、contract 与 package 一致性

- [x] 3.1 更新 `task-worktree`、`task-finish`、相关 consumers 与 capability contracts，统一普通 execution 和专项 activation 边界。
- [x] 3.2 统一 `task-finish` frontmatter、package manifest 和 workspace manifest description，并增加 package 静态一致性检查。
- [x] 3.3 更新受影响 Product current knowledge，确保任务环境、runtime projection 与 Task Finish 说明和最终实现一致。

## 4. 验证

- [x] 4.1 运行 OpenSpec strict validation、proposal baseline/check、provider/consumer contract tests 与受影响验证。
- [x] 4.2 冻结最终实现候选并运行所需正式保证，记录候选 identity、耗时、覆盖与 evidence 生命周期。
