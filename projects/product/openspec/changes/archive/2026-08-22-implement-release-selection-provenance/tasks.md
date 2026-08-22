## 1. Release selection owner

- [x] 1.1 新增 `tools/release/release-selection.mjs` 与 closed schema/read model。
- [x] 1.2 实现 create/update/inspect/freeze/abandon/cleanup 及 fail-closed Git 授权检查。
- [x] 1.3 提供 standalone JSON CLI，确保不执行远端或公共 mutation。

## 2. Contract and tests

- [x] 2.1 增加 `release-collection-model` delta spec，明确 selection chain、lifecycle refs 与冲突恢复。
- [x] 2.2 增加临时 Git integration tests，覆盖成功、幂等、漂移、冲突、冻结、放弃和 cleanup 边界。
- [x] 2.3 运行 strict OpenSpec validation 与 focused release tests，记录实现限制。
