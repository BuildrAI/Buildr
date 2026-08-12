## 1. Deterministic sync planner

- [x] 1.1 抽取并扩展Requirement/Scenario结构解析，稳定识别完整、partial、重复和非规范输入
- [x] 1.2 实现版本化sync plan与ADDED/REMOVED/RENAMED/完整MODIFIED/Scenario增改保守判定
- [x] 1.3 实现already-applied、semantic-resolution-required、baseline/canonical drift与active conflict结果

## 2. Atomic apply与convergence

- [x] 2.1 实现identity-bound plan receipt和写入前重验
- [x] 2.2 实现整批expected files验证与原子apply，保证blocked/失败零部分写入
- [x] 2.3 实现convergence orchestrator与阶段receipt/resume，组合rehearsal、pre/post guard和strict validation
- [x] 2.4 增加`openspec sync-plan|sync-apply|converge`产品入口及公共JSON/CLI architecture契约

## 3. Task Finish集成与效率证据

- [x] 3.1 让Task Finish convergence handler调用产品orchestrator并在语义blocked时返回Agent fallback
- [x] 3.2 统一Workspace/Product/Service root与cwd解析，阻止嵌套Workspace和相对路径误路由
- [x] 3.3 completion receipt持久化完整run/attempt/retry/waste/round-trip/output timing evidence
- [x] 3.4 full detail改为有界preview与run-owned diagnostics引用，保持compact安全字段

## 4. Skills、知识与验证

- [x] 4.1 更新Task Finish Skill与capability contract，仅保留orchestrator路由、blocked fallback和结果证据
- [x] 4.2 更新OpenSpec lifecycle current knowledge、Brief、impact evidence和长期Task Finish任务看板
- [x] 4.3 增加planner/apply/orchestrator/atomic failure/root resolution/receipt diagnostics的unit、contract与integration覆盖
- [x] 4.4 完成proposal guard、affected验证与真实finish benchmark，报告自动覆盖率、fallback、工具往返、输出近似量和端到端耗时
