# 实施清单

- [x] 1. 新增 `src/storage/program-packages.ts`：程序包引用观察（连接库绑定路径、更新记录、策略默认位置）与候选生成（`program-package` kind，24h 稳定窗口，包目录自身占用边界，观察失败保留），及执行时引用复查函数。
- [x] 2. `src/storage/files.ts` 扩展 `StorageCandidate.kind` 支持 `program-package`；`src/application/storage-maintenance.ts` 的 inspect/collect 接入候选与条件执行复查。
- [x] 3. 单元测试（`test/unit/program-packages.test.ts` 及维护集成点）：被绑定保留、未完成更新回退/目标保留、completed 旧观察不保留、默认位置保留、占用保留、稳定窗口保留、无引用回收、身份变化保留、引用观察失败保留、`.prepare-*` 遗留回收。
- [x] 4. 运行 buildr-agent 静态检查与单元测试，修复回归。
- [x] 5. 知识校准（reconcile）：`knowledge/docs/architecture/agent-integration.md` 存储生命周期段落补充程序包回收事实；核对 code-map/index 相关登记并按需更新。
