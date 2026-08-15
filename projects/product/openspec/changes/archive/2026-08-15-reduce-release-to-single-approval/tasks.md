## 1. 发布事务契约

- [x] 1.1 将 release authority 静态 preflight 调整为只接受单个 `workflow_dispatch` 入口、唯一 `npm-production` job 与唯一 OIDC/publish owner
- [x] 1.2 实现 closed dispatch inputs、同 run 跟踪和审批提示的 `release-transaction-runner.mjs`，移除本机 probe-only runner 所有权
- [x] 1.3 让 hosted OIDC evidence 可被同一 protected job 的 `pre-tag` convergence直接消费，并拒绝 source/workflow/run/expiry/remote drift
- [x] 1.4 实现 release tag 的 `preflight|ensure` 幂等 helper，允许同 source恢复并拒绝移动、覆盖或错误 target

## 2. GitHub Actions 编排

- [x] 2.1 将 `publish.yml` 切换为显式 release dispatch，并让 contract/candidate/Host Node/Launcher checkout冻结 source且保持 read-only
- [x] 2.2 将 authority probe、最终 pre-tag gate、tag ensure、publish、Registry/GitHub Release readback和安装 smoke收敛到唯一 `npm-production` job
- [x] 2.3 保持一次 application payload build、一次 `npm pack`、同一 tarball跨job复用和同run恢复语义

## 3. 契约与回归验证

- [x] 3.1 更新 release authority、convergence、transaction runner和tag ensure的unit/integration tests，覆盖正常路径、credential-free、并发恢复与漂移阻断
- [x] 3.2 更新 workflow静态契约测试，证明只有一个Environment owner、审批前全部可逆依赖、无tag-push/probe-only入口且mutation顺序正确
- [x] 3.3 更新 verification registry与changed-path owners，并运行release focus、contract和affected反馈验证

## 4. 消费者与当前认知

- [x] 4.1 更新 `buildr-release` Skill与release checklist，使正式发布只dispatch并跟踪一次事务且不再本机建tag
- [x] 4.2 更新 release flow、technical architecture与Change Brief/knowledge impact evidence，明确一次审批边界、恢复语义和新attempt限制
- [x] 4.3 运行OpenSpec strict、convergence preflight与current knowledge inspect，修复全部archive readiness问题
