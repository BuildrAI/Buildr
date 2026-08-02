## 1. Authority 与 Environment Manager 门禁

- [x] 1.1 让 Task checkout/provider evidence 成为 Environment 源码版本基础，移除 controller content identity 的 ready/drift/handoff/generation authority
- [x] 1.2 为 Git-backed retained manager 增加覆盖 staged/unstaged/untracked 的精确 source clean probe，排除 `.buildr/`，并在首次 `prepare` 的任何持久效果前阻断
- [x] 1.3 对 prepare、resource register/release、cleanup 保持 retained sourceRoot/adapter 与 candidate mutation guard；允许 candidate 只读 inspect
- [x] 1.4 修订 workflow、并发 acceptance、Preview 与 Finish cleanup 的 canonical consumer requirements，移除稳定 controller identity 门槛

## 2. Consumer migration

- [x] 2.1 让 retained Workspace 从 M1 前进到 M2 时只重新 probe 原 Task checkout，不更新 Receipt 创建指纹、不自动同步源码且不返回 controller handoff
- [x] 2.2 将 Preview owner/caller 从 controller hash 迁移到 Task、Workspace、Environment root、resource ID、provider identity/handle，并兼容忽略旧字段
- [x] 2.3 从 Verification evidence identity material 与 Task Finish prepare input identity 删除 retained controller hash，保留 Candidate、policy、Environment/execution、Runtime/CLI/依赖/projection、adapter、Workspace Node 与 check identity
- [x] 2.4 更新 Task Environment/Finish package Skill、capability contract、CLI/JSON 文档与 Local App 文案，明确 controller identity 仅为 Receipt 创建指纹

## 3. 专项测试与边界回归

- [x] 3.1 覆盖 Git manager staged/unstaged/untracked dirty 首次 prepare 零持久效果，以及 `.buildr/tasks/**` 不影响 clean/创建指纹
- [x] 3.2 覆盖 clean retained M2 对 M1 Task checkout 的 inspect/prepare/cleanup/resource 操作不 handoff、不改写 identity、不自动 rebase，并继续真实 probe
- [x] 3.3 覆盖 dirty manager、candidate mutation、sourceRoot/adapter mismatch 仍 blocked，candidate 只读 inspect 仍可用
- [x] 3.4 覆盖 Preview ownership 不消费 controller hash，以及 Verification applicability identity 不消费 retained controller hash
- [x] 3.5 运行现有 Task Environment、Preview、Verification 与并发 acceptance 受影响测试并修复回归

## 4. 当前认知、审查与正式验证

- [x] 4.1 更新 Change Brief/knowledge impact，完成 glossary、technical architecture 与 Buildr Service 的 current knowledge assess/reconcile
- [x] 4.2 主动审查全部 controllerIdentity consumer、最终 diff 与 OpenSpec strict/contract guard，确认未新增 update/rebase/rebind/generation authority，未修改 Task Finish `.buildr/` clean 判定或 `introduce-task-review-results`
- [x] 4.3 对冻结候选运行项目要求的正式验证与 Doctor，记录 timing/evidence 后仅完成本 checkbox
