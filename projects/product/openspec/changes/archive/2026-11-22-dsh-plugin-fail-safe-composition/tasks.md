## 1. 组合补丁与兼容探测机制

- [x] 1.1 修改 `projects/product/services/dsh-plugin/tools/build-composition.ts` 中的 `compositionPatch`，移除对官方根模块、预设和客户端模块的静态 `disabled: true` 条目，并将新增组合源码纳入编译校验；运行单元与构建检查确认补丁内容与编译通过。
- [x] 1.2 新增 `projects/product/services/dsh-plugin/plugin/composition/compatibility.ts`，实现零副作用的模块导出结构、原型方法与已激活服务方法核对逻辑；编写单元测试覆盖类方法缺失、导出结构变化、导入报错与兼容场景并验证通过。
- [x] 1.3 新增 `projects/product/services/dsh-plugin/plugin/composition/circuit-breaker.ts`，实现按 `(hostVersion, compositionIdentity)` 建键的跨进程启动熔断器（无绝对路径泄露、IO 容错）；编写单元测试覆盖正常确认、异常熔断、同进程热重载与版本升级重置并验证通过。

## 2. 有界清理、激活回滚与状态表达

- [x] 2.1 修改 `projects/product/services/dsh-plugin/plugin/composition/configuration-owner.ts`，增加 `isContextDisposing`、`boundedAwait` 与 `release({ restoreStock, timeoutMs })`，确保宿主销毁阶段不排队热重载锁、不重起原生 `agent-loop` 且等待有界；验证 `configuration-owner` 相关检查通过。
- [x] 2.2 修改 `projects/product/services/dsh-plugin/plugin/composition/index.ts`，串联熔断检查、契约探测、受保护接管、激活后必需同级条目审计与按序回滚、`loader/patch-context` 激活门控、有界停机清理及 `buildrCompositionRuntime.status()`；确保原生模块恢复无死锁且降级不阻断启动。
- [x] 2.3 修改 `projects/product/services/dsh-plugin/plugin/src/types.ts`、`projects/product/services/dsh-plugin/plugin/src/index.ts` 与 `projects/product/services/dsh-plugin/plugin/README.md`，在不影响正常激活兼容性的前提下暴露结构化降级状态并同步组合说明文档。

## 3. 回归测试与实机隔离验证

- [x] 3.1 补齐 `projects/product/services/dsh-plugin/test/unit/composition.test.ts`、`test/integration/composition-lifecycle.test.ts` 与 `test/integration/configuration-owner.test.ts`，覆盖静态无禁用、DSH 0.2.2-rc.5 类接口不兼容自动降级、同级必需条目失败回滚、宿主销毁无死锁和熔断恢复用例。
- [x] 3.2 在隔离工作树执行全量 `test:static`、`test`、插件集成测试及真实 `/Applications/DeepSeek Harness.app`（`0.2.2-rc.5`）APFS 隔离后台实测，确认不兼容时 5 秒内正常 `ready` 且关闭信号干净退出码 0，同时不改动本机真实配置与代码知识文档（`projects/product/knowledge/` 无受影响文件）。
