## 1. Product root ownership guard

- [x] 1.1 扩展 `product-source-layout` verifier，将 Product Project root 的 `node_modules` 作为已废弃 package root 遗留物拒绝，并提供唯一 Service package root 的修复指引。
- [x] 1.2 更新 source-layout contract tests，覆盖允许的治理根、遗留 `node_modules` 失败和 Service root 唯一所有权。

## 2. 维护入口与受影响验证

- [x] 2.1 修正缺依赖维护提示，使 `npm ci` 指向 `projects/product/services/buildr`。
- [x] 2.2 运行 source-layout contract 与架构验证，证明遗留目录会失败、干净 task worktree 通过。

## 3. 候选验证与集成

- [x] 3.1 冻结实现候选并运行 Product Candidate，记录与 task worktree 一致的验证 identity 和 timing summary。
- [x] 3.2 通过 task-finish 归档、提交并集成已验证 change，保留主 checkout 的清理前状态供复核。

## 4. 当前遗留收尾

- [x] 4.1 集成产品变更后，复核主 checkout 的 Product Project root 无 package metadata，并将唯一已证明的遗留目录 `projects/product/node_modules` 移至废纸篓。
- [x] 4.2 在主 checkout 验证 Product Project root 不再包含遗留依赖入口，并记录清理结果。
