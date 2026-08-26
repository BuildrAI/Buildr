## 1. Carrier cleanup authority

- [x] 1.1 将 repository-set Finish cleanup 改为独立收集 Environment cleanup 与每个 carrier cleanup，Environment attention 不得跳过 carrier removal
- [x] 1.2 为 carrier removal 增加 registration/path/container 物理读回，并只从明确结果投影 `retained|cleaned`
- [x] 1.3 删除以 cleanup phase passed 推断 carrier cleaned 的 fallback，并为历史完整/缺失cleanup事实提供保守兼容 reader

## 2. Writable Activation 与 Doctor

- [x] 2.1 增加 owner-bound Structured Store activation helper，在matching target lease内通过retained writer原子应用pending migrations
- [x] 2.2 调整顺序为 Delivery → writable Activation → read-only Doctor；self-bootstrap继续消费同一run执行sync/entry与attention恢复
- [x] 2.3 保持 Doctor只读、Delivery不可撤销、无新Finish run/业务push/Verification重跑

## 3. Historical recovery and Environment cleanup

- [x] 3.1 从冻结Task Contribution、当前source tree、carrier/target Git objects与remote containment重建旧run cleanup proof
- [x] 3.2 让Environment cleanup消费重建proof并保持source drift、unknown path与identity mismatch fail closed
- [x] 3.3 为错误cleaned投影的当前run提供精确owner cleanup与`retry-after-foreign-clear`恢复事实

## 4. Verification and current knowledge

- [x] 4.1 增加Environment attention + carrier removed/retained、非空current carrier、历史proof恢复的unit/integration测试
- [x] 4.2 增加v18 store + delivered migration 19、writable Activation、最终Doctor与same-run recovery的system测试
- [x] 4.3 更新Brief、Buildr Service与closeout flow current knowledge，确认术语无需新增glossary
- [x] 4.4 运行focused、contract、affected/full plan、OpenSpec strict/preflight与diff检查，修复全部本Change回归
