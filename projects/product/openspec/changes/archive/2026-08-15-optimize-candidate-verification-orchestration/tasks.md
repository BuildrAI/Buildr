## 1. 验证完整性

- [x] 1.1 为 registry `node-test` 与受管测试 glob 增加非空文件解析和 fail-closed 回归测试
- [x] 1.2 退役失效的 `integration-candidate-recovery` step、package script 与 aggregate 期望，并证明剩余 recovery primary owners 完整

## 2. Changed 与正式能力选择

- [x] 2.1 为 package/lockfile 仅版本字段变化实现保守 affected 分类，并覆盖版本-only、依赖变化和无 base 三类测试
- [x] 2.2 在 Declaration Intake 精确授权后把 `product.release-artifact-set` 改为 optional，更新 capability 契约测试和使用说明

## 3. Candidate CI 编排

- [x] 3.1 将 Windows Workspace/Task primary owners 拆成两个无 artifact shard，并更新 registry、evidence aggregate 与 owner 完整性测试
- [x] 3.2 将 preflight 与 artifact 合并为 bootstrap job，只让真实消费者下载 Candidate artifact
- [x] 3.3 将稳定 `Candidate gate` 改为无 `npm ci` 的纯 Node 聚合，并增加 clean checkout/缺失与重复 evidence 回归

## 4. 认知与直接验证

- [x] 4.1 更新 Change Brief、Buildr Service current knowledge 和验证/发布说明，使 primary owner 与新 DAG 一致
- [x] 4.2 运行相关 Unit、Contract、plan-only、workflow contract 与 OpenSpec strict 验证，修复全部直接回归并准备 convergence
