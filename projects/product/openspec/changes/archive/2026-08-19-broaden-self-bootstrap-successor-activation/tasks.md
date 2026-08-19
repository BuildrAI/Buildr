## 1. 宽而薄治理原则

- [x] 1.1 在 Buildr Core Rule 产品源中增加宽而薄的结果边界原则，并保持 Rule 不承载具体流程
- [x] 1.2 在 Product Project Rule 中增加硬门禁的 authority、具体伤害与安全继续路径检查

## 2. Self-bootstrap successor 语义

- [x] 2.1 将 bundled runner 的普通 descendant 检查改为已发布、无 merge、包含 Finish ref 的线性 Git/remote 事实，保留 current-run trailer 幂等身份
- [x] 2.2 更新 `buildr-self-bootstrap-sync` Skill 与 Component integrity，删除普通 descendant 必须带 Buildr provenance 的语义
- [x] 2.3 保持稳定 Finish projector、target lease、foreign carrier、same-run resume、dirty、未 push、remote drift、Development entry 与最终 Doctor 边界不变

## 3. 回归与正式语义

- [x] 3.1 更新 self-bootstrap integration tests，覆盖原 Finish ref、带 Buildr provenance descendant、无 trailer 的已发布协作者 successor、merge、dirty、未 push、remote drift、幂等和 same-run resume
- [x] 3.2 更新 contract tests，证明新 Skill/runner 语义与 Core/Product Rule 一致且没有新增 lifecycle store 或 projector schema
- [x] 3.3 更新 OpenSpec Change 生命周期 current knowledge，并完成 Brief、knowledge impact 与术语核对
- [x] 3.4 运行 targeted regression、OpenSpec strict validation 与 convergence readiness 检查，修复全部直接问题
