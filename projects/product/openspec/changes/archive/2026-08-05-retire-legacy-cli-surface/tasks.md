## 1. CLI 与领域能力清退

- [x] 1.1 从 command catalog、帮助 surface 和 public JSON registry 删除三个 Legacy CLI，并增加 unknown-command 零写入保护
- [x] 1.2 删除 OpenSpec baseline/check handler、legacy deprecation registry、旧 sidecar 专用 helper 与相关 tests
- [x] 1.3 删除 Project Skill migration planner/apply handler，并把 Doctor、render 和 Skills diagnostics 收敛为无自动迁移的 fail-closed 输出

## 2. Consumer 与 package 收敛

- [x] 2.1 更新 OpenSpec apply contribution 与 contract guard，删除 baseline/check 调用并保留 strict validation、Planning Review 和 converge 边界
- [x] 2.2 更新 Buildr Skill/package/runtime sources、Component integrity 和 focused package validation，使 sync 后不再投射 Legacy CLI 指引

## 3. 产品事实与验证

- [x] 3.1 更新 CLI、JSON、Skill capability、产品说明、current knowledge 与 changelog，明确破坏性删除和旧 workspace 边界
- [x] 3.2 更新 CLI、OpenSpec、Skills、Doctor、package 与 contract tests，运行受影响验证并修复所有失败
- [x] 3.3 完成 current knowledge reconcile/inspect、Change checklist、strict validation 与单一 convergence/archive
