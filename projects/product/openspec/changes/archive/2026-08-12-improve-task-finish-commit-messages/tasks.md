## 1. 交付输入与运行事实

- [x] 1.1 实现提交信息规范化与校验，确定性维护 `Buildr-Task` trailer，并覆盖缺失、空主题、占位主题和换行规范化测试
- [x] 1.2 扩展 Task Finish CLI 与入口 readiness：新 run 必须提供语义 message，已有 run resume 只消费冻结事实
- [x] 1.3 扩展 current run 持久化与 compact result，保存恢复所需完整 message 并只公开 subject/identity，兼容已有 legacy run

## 2. Delivery Carrier 接线

- [x] 2.1 让 prepare 使用 run-owned message 创建 carrier commit，并校验实际 Git message identity
- [x] 2.2 在 deterministic reuse、Delivery Adaptation 与 resume 路径核验冻结 message，阻止适配提交绕开约定

## 3. 产品契约与 Agent 入口

- [x] 3.1 更新 Task Finish capability contract、Skill、CLI reference/help 与 package/runtime 投射副本，说明 Agent 负责语义、产品负责冻结复用
- [x] 3.2 更新受影响 Component/package integrity，保持 Workspace authority 与随包资产一致

## 4. 验证与 Change 处置

- [x] 4.1 增加 unit、integration、system 与 contract 回归，覆盖新 run、legacy run、resume、adaptation 和公开结果边界
- [x] 4.2 运行 Task Finish 相关 changed/focused 检查，修复失败并记录验证反馈
- [x] 4.3 收敛 Brief/current knowledge 与 terminology impacts，完成 Change-owned checklist 并确认 archive readiness
