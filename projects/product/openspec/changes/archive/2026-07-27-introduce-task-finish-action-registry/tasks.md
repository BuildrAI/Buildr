## 1. Registry 与解析

- [x] 1.1 新增版本化 Task Finish action registry，并为全部标准 steps 声明执行种类、surface、授权、effects、结果、evidence 与 fallback
- [x] 1.2 实现基于 finish run 与结构化 action context 的唯一解析、输入缺口和 `agent-reasoning-required` 结果

## 2. Executor 与 CLI

- [x] 2.1 让 safe executor 默认消费 registry 计划并自动生成 identity-bound fingerprint，同时保持 caller plan 兼容
- [x] 2.2 增加只读 `task finish actions` CLI 与 compact/full JSON 输出，暴露 selected action、provider handoff 或 fallback
- [x] 2.3 更新 CLI help、Task Finish Skill 源和 CLI 文档，使正常收尾以 registry 驱动为默认路径

## 3. 质量与长期资产

- [x] 3.1 增加 registry 完整性、自动执行、查询无写入、输入缺口、provider handoff、registry miss 与兼容路径测试
- [x] 3.2 完成 Brief/current knowledge/terminology assess 与 reconcile；更新 Task Finish 优化任务看板关联本 Change
- [x] 3.3 运行 OpenSpec strict/proposal guard、focused tests 与最终 affected assurance，并保存可核验结果
