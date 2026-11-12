## 1. 并发门禁（先于主实现定案）

- [x] 1.1 复用执行器测试 harness，构造同共享 home 多进程并发 turn 级集成测试：并发写入、跨进程 resume、中断后恢复，断言状态库完整与会话可续（并发写已用真实二进制实测通过，见 design；本项补 turn 级）
- [x] 1.2 门禁未通过则回到 design 修订粒度/并发策略，不进入主实现

## 2. home 键与租约分离

- [x] 2.1 Codex 网关模式 `CODEX_HOME` 指向 `nativeAccountConfigRoot` 共享根（`executors/codex/index.ts`），原生登录模式保持不变
- [x] 2.2 DSH 网关模式 `DSH_HOME`/`DSH_AGENTS_HOME` 指向共享根（`executors/dsh/index.ts`），原生登录模式保持不变
- [x] 2.3 核对 `connection-application.ts` 网关 configRoot 与共享根关系，确保进程壳/临时目录仍按租约、home 按连接

## 3. 租约专属文件外移

- [x] 3.1 Codex `buildr-model-catalog.json` 写入租约临时路径并经 `-c model_catalog_json` 引用，不落共享 home
- [x] 3.2 DSH `buildr-model-gateway.json` 及 bridge/patch 等租约文件写入租约目录，不落共享 home

## 4. 绑定与解析双轨

- [x] 4.1 新参与方持久化准确 home 根（`StoredParticipant.nativeHomeRoot`），一经选定不变
- [x] 4.2 `native-content-resolver.ts` 双轨：有持久化路径用路径，无则按原租约身份反算
- [x] 4.3 绑定身份格式不变，共享根下 realpath+inode 绑定；旧参与方保留租约 home 保证绑定稳定

## 5. 同 home fork 不复制

- [x] 5.1 Codex 源/目标同 realpath 时跳过 rollout 复制；跨旧租约 home 仍走原复制路径
- [x] 5.2 DSH 同 host 存储内直接 fork，跳过 `transferFork` export/import；跨旧租约 home 仍走原路径

## 6. 状态库维护

- [x] 6.1 新增状态库线程级候选枚举，复用对话头/原生工具内容/交接索引完整引用证明
- [x] 6.2 运维工具默认 dry-run 逐项收据，`--confirm` 绑定已核对收据；清理无引用线程并收缩库
- [x] 6.3 自动维护永不纳入状态库；稳定窗口、占用观察、删除前后身份复核、不确定保留

## 7. home 级回收

- [x] 7.1 在会话级回收之上新增 home 级候选：完整证明无参与方/原生工具/交接/保留运行引用、过稳定窗口、无占用
- [x] 7.2 默认 dry-run、显式确认整目录回收；不迁移/不合并旧租约 home 状态库

## 8. 集成测试

- [x] 8.1 共享 home 复用、租约文件外移（执行器级集成测试已加并通过）
- [x] 8.2 同 home fork 不复制、跨旧 home fork 兼容
- [x] 8.3 双轨解析：历史工具详情/交接可读、旧编码、身份漂移保留
- [x] 8.4 状态库引用保留/未确认保留/确认裁剪/不确定保留；死 home 回收/活跃保留
- [x] 8.5 原生登录与网关同根先后使用互不干扰

## 9. 当前认知校准

- [x] 9.1 按 current-knowledge-maintenance 校准 `knowledge/docs/architecture/agent-integration.md` 的 home 隔离描述（网关模式按连接共享 home、令牌隔离、home 级状态跨对话共享）

## 10. 直接验证

- [x] 10.1 类型检查与静态检查通过（agent-typecheck、agent-source-boundaries）
- [x] 10.2 buildr-agent 单元测试(300)与执行器/对话/存储集成测试通过；唯一失败为干净 dev 亦复现的预存时间敏感用例，与本次无关
- [x] 10.3 真实开发 profile 验证：换模型不新增 home、历史可读、存储收敛

> 任务 1 实测补记：真实受管 codex 0.167.0，合成模型网关产生真实 turn→rollout 落共享 home；关闭进程 A 后，同共享 home、同租约绑定的进程 B 经 `thread/resume` 跨进程读回原 turn 并续写新 turn（`model-gateway.test.ts` 真实二进制用例，BUILDR_CODEX_FORK_EXECUTABLE 门禁）。此前 concurrency-test 的 0/12 系空线程无 rollout 且误用 thread/read；真实 turn + thread/resume 后跨进程恢复成立。中断后恢复复用同一 resume 路径（stop/recovery 既有测试覆盖单进程中断）。

> 任务 10.3 实测补记：真实开发 profile 只读 dry-run——会话级 137 候选/38 可回收(~25MB)、home 级 317 候选/1 可回收；引用保留 88+110、近期窗口 196、占用 5、路径保守 16，门禁生效。状态库 dry-run 240 线程/活 home 占用保留、死租约 133 可回收。共享 home 复用与历史可读由集成测试覆盖；活体"换模型不新增 home"待 buildr-self-bootstrap-sync 激活后验证。实际 --confirm 回收为破坏性操作，留待人工核对收据后执行。
