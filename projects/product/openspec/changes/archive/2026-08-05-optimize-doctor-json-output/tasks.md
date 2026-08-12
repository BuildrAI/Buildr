## 1. Doctor JSON 契约

- [x] 1.1 将 `doctor --json` 默认 detail 改为 compact，并保持 `--detail full` 显式完整输出
- [x] 1.2 更新 CLI 帮助与公开 JSON 契约测试，覆盖默认、compact 和 full 字段边界

## 2. 内部最终 Doctor

- [x] 2.1 提取 4 MiB bounded compact Doctor runner，分类业务失败、输出超限和其他执行失败
- [x] 2.2 让 sync 与 Component reconcile 的全部最终 Doctor consumer 使用共享 runner

## 3. 回归与认知

- [x] 3.1 增加 full 输出超过 1 MiB、compact 健康且内部 consumer 成功的回归测试
- [x] 3.2 增加 Doctor 业务失败、输出超限和子进程执行失败的分类测试
- [x] 3.3 评估并收敛 Change Brief、当前认知与术语影响
- [x] 3.4 运行受影响直接验证，修复发现并确认 Change 可收敛
