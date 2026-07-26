## 1. 执行契约与状态机

- [x] 1.1 建立 Change contract baseline，并实现 finish run schema、固定步骤 DAG、原子持久化与 inspect result。
- [x] 1.2 实现 advance/resume、attempt/fingerprint 幂等、blocked/stale 传播和 effects/evidence 历史。
- [x] 1.3 实现 shared-resource 短 lease 与 target-ref 乐观并发输入。

## 2. CLI 与 Skill 收敛

- [x] 2.1 增加 `buildr task finish inspect|advance|resume` registry、help 与 JSON/text 输出。
- [x] 2.2 将 Task Finish Skill 精简到约 1,500–2,500 Unicode 字符、30–50 行，并更新 capability contract/package target。
- [x] 2.3 更新 package integrity、runtime projection 和受影响 current knowledge，明确 Codex worktree/session adoption 边界。

## 3. 行为验证

- [x] 3.1 增加恢复与幂等测试：push passed、cleanup blocked 后只恢复 cleanup。
- [x] 3.2 增加 fingerprint 失效测试：最终树变化只使 assurance 及下游 stale。
- [x] 3.3 增加并发与 lease 测试：独立 run 并行、共享资源互斥、过期 lease 恢复。
- [x] 3.4 增加 CLI integration 测试并替换依赖 Skill 固定字符串的主要断言。

## 4. 收敛与交付

- [x] 4.1 运行 OpenSpec strict、proposal/pre-sync/post-sync guards 与受影响验证，记录 evidence identity 和耗时。
- [x] 4.2 完成 current knowledge reconcile、Component integrity、doctor 与最终 required assurance。
- [x] 4.3 完成新版 Task Finish run 的归档前检查；交付时保留并报告未经授权不得删除的遗留 Buildr worktree。
