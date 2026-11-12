## 1. 实现

- [x] 1.1 重写 `activate-runtime.ts` owned 回退：先试 if-idle（空闲快路径），被 busy/abort 拒绝则保留旧 owner 并 30s 有界重试 prepare。
- [x] 1.2 交接沿用 connect 既有 `/runtime` + `requireRuntime` 机制，`activationTimeoutMs` 默认 120s；不新增客户端交接调用。
- [x] 1.3 核对公开 API：无需新增导出（不读私有进程记录）。

## 2. 测试

- [x] 2.1 激活集成新增用例：忙 owner + storage 锁竞争 + 安装包目标 → 激活 ready、旧代际保留、对话 run 仍在旧代次运行。
- [x] 2.2 不兼容/损坏目标既有用例（broken target、busy 保护）回归通过。
- [ ] 2.3 既有 handoff/startup 组回归通过。

## 3. 当前认知

- [x] 3.1 assess：code-map 无激活细节描述；agent-integration.md 已补锁竞争保留重试一句，与实现一致。

## 4. 验证

- [ ] 4.1 agent 静态（typecheck/source-boundaries）+ 单元 + handoff 集成。
- [ ] 4.2 buildr `npm run check` 全量。
- [ ] 4.3 交付后以同一 closeout 入口重试自举激活，确认保留交接完成。
