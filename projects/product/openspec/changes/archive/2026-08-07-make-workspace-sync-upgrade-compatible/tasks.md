## 1. Contract and package validation

- [x] 1.1 扩展 capability retirement manifest schema，支持并校验 `legacyIntegrities`，保持未知 hash fail closed
- [x] 1.2 为 `task-asset-review/v1.md` 登记已证明的历史官方 hash，并补充 package/retirement 静态校验测试

## 2. Workspace sync migration

- [x] 2.1 增加 sync 在 source mutation 前调用 canonical writable SQLite migration boundary 的流程，并保持 provenance、busy、drift 和原子失败语义
- [x] 2.2 补充 sync 对 pending 0005、0006 自动升级、重复执行幂等及 migration 失败零源资产 mutation 的集成/system 测试

## 3. Retirement and end-to-end verification

- [x] 3.1 补充已知历史 contract hash 可退休、未知修改阻塞且零 mutation 的回归测试
- [x] 3.2 运行 affected package check、SQLite/sync tests、Doctor 与 OpenSpec validation，记录候选验证结果
- [x] 3.3 更新 Development Content Target、Verification/Candidate evidence，并形成 Task Finish handoff
