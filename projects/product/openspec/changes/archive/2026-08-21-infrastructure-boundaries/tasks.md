## 1. 盘点与边界基线

- [x] 1.1 建立 SQLite、migration、filesystem、Git、process、network、platform、clock、crypto 入口及其直接消费者 inventory，标记唯一 owner、重复实现和业务 Persistence owner。
- [x] 1.2 为 Infrastructure、Task、Workspace、Bootstrap、Application payload 与 Verification selector 确认目标路径和允许的 imports，补充结构回归断言。

## 2. Infrastructure 机制收敛

- [x] 2.1 收敛 SQLite connection/store、全局 migration runner、锁与事务协调到唯一 Infrastructure 入口，保持 migration 顺序、checksum、幂等、回滚和原子性。
- [x] 2.2 收敛 filesystem、Git、process、network、platform、clock、crypto 等通用 adapter，删除重复实现并保留窄 capability contract。
- [x] 2.3 将现有直接消费者切换到统一 Infrastructure provider，保留必要的短期 Facade 转发并记录明确退出条件。

## 3. 业务模块与组装迁移

- [x] 3.1 将业务 Repository、DAO、Mapper、Row 和存储对象归回所属 Task、Workspace 等模块的 `persistence`，移除 Infrastructure 中的业务语义依赖。
- [x] 3.2 更新 Bootstrap module registration、runtime wiring、Application payload manifest 与 imports，确保 development checkout 和正式 payload 使用同一逻辑入口。
- [x] 3.3 更新 Verification owner、selector 与受影响测试，覆盖模块边界、唯一 writer、CLI/HTTP/JSON 等价和 SQLite 行为等价。

## 4. 收敛验证

- [x] 4.1 运行 strict OpenSpec validation、结构/静态检查、typecheck 与受影响 unit/component/integration tests，修复直接诊断。
- [x] 4.2 运行 migration、锁/事务、CLI/HTTP/JSON、Application payload/npm candidate 与 Verification owner 回归，记录行为等价证据。
- [x] 4.3 更新 migration/模块迁移台账，确认无重复入口、无未授权业务 writer、无循环依赖，并准备 Change archive 所需的收敛事实。
