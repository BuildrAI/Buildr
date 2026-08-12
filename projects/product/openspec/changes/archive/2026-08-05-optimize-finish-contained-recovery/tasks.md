## 1. Already-contained 交付恢复

- [x] 1.1 增加 carrier ancestor 与 changed-path after mode/blob 的确定性包含检查。
- [x] 1.2 在 deliver 中采用 `targetDisposition: already-contained`，保留原 carrier 并允许最新后代 ref 完成 Doctor 与 cleanup。
- [x] 1.3 覆盖完整包含、同路径变化、非祖先与 fetch/identity 不可证明场景。

## 2. 自举 Workspace 两段式同步

- [x] 2.1 更新 `buildr-self-bootstrap-sync` Skill 与 Contribution，定义严格 preparation eligibility、本地 commit 不 push、Formal Finish 后 publish。
- [x] 2.2 更新自举 Component/package contract tests，证明普通 Workspace 与通用 Task Finish 不获得 self-bootstrap 特判。

## 3. 契约与验证

- [x] 3.1 更新受影响的 Task Finish、Agent workflow 与 package verification tests和静态契约。
- [x] 3.2 运行 OpenSpec strict validation、受影响测试与 package/runtime parity 验证。

## 4. 当前认知与收敛

- [x] 4.1 收敛 Brief、OpenSpec lifecycle flow、technical/service knowledge 与术语影响。
- [x] 4.2 运行 current knowledge inspect 与 `buildr openspec converge`，确认 canonical specs、archive 与回执一致。
