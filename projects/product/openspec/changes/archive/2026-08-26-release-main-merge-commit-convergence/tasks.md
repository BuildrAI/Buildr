## 1. Reconciliation domain and release identity

- [x] 1.1 在 `tools/release/release-selection.mjs` 增加独立的 main reconciliation provenance、generation、父提交和 resolution identity 模型，保持 dev baseline 与 ordered cherry-pick chain 不变
- [x] 1.2 在 `tools/release/release-selection.mjs` 与 `tools/release/release-git-convergence.mjs` 增加 current main/release/freeze/ownership 的 compare-and-swap 检查，并实现隔离 checkout 中的 merge-commit reconciliation；冲突、漂移、公开发布和未授权输入必须 fail closed
- [x] 1.3 为 reconciliation 增加幂等 readback 与生命周期持久化，确保相同 live inputs 不重复创建 merge commit，且旧 generation 的 Candidate/artifact/readiness/transaction 引用可判定为 stale

## 2. Release Git、readiness 与 Candidate 衔接

- [x] 2.1 更新 `tools/release/release-git-convergence.mjs` 的 carrier/PR read model，绑定 reconciliation identity，并强制 release→main PR 使用 merge commit
- [x] 2.2 更新 `tools/release/release-readiness.mjs` 与 `release-transaction-runner.mjs` 的 transaction context，使新 release generation 必须匹配 Candidate source、唯一 artifact、main 父提交关系和最终 tree
- [x] 2.3 在 release orchestration/CLI 入口暴露一次性 reconciliation action，返回 portable recovery identity、冲突 paths、effects 和后续重跑 Candidate 的明确 next action

## 3. Contract、integration 与 regression tests

- [x] 3.1 增加 release selection/convergence unit tests，覆盖 main 漂移、冲突 fail-closed、父提交记录、resolution identity 和幂等恢复
- [x] 3.2 增加 release Git integration tests，覆盖 generation carrier、PR merge method、错误的 squash/rebase readback、tree mismatch 与远端 ref 竞争
- [x] 3.3 更新 `release-model-governance`、`open-source-release` 和 release integration contract tests，覆盖 dev 线性历史、独立 reconciliation provenance 与旧 evidence 失效

## 4. 产品契约与发布操作指引

- [x] 4.1 更新 Buildr Release Skill、`docs/release-checklist.md` 及 release knowledge，明确 `dev → release → main`、一次性 reconciliation、merge commit 和 Candidate 重跑顺序
- [x] 4.2 运行 `openspec validate release-main-merge-commit-convergence --strict` 与 Change convergence preflight，修正 projection/contract 诊断并完成 Change archive readiness
