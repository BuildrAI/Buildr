## 1. 数据模型与单一 authority

- [x] 1.1 增加连续 SQLite migration，为 `task_execution_records` 添加 nullable `invocation_identity` 与 active lookup index，并更新package baseline/migration测试
- [x] 1.2 扩展 Task Execution Record domain、repository与Application closed shape，兼容旧record且原子返回`opened|existing-active`
- [x] 1.3 增加相同invocation并发open、terminal历史、显式retry和旧row兼容的Unit/Component测试

## 2. Verification 重复启动保护

- [x] 2.1 为formal Verification请求生成portable `invocationIdentity`，只覆盖Task、target、Project/declaration与规范化capability集合
- [x] 2.2 在`verification run`中消费Application原子open结果，默认对existing active返回零执行结果，并支持显式`--retry`创建独立run/record
- [x] 2.3 增加默认去重、显式retry、quota/backpressure、target/declaration/capability差异与零process副作用测试

## 3. Agent只读回查CLI

- [x] 3.1 为Task Execution Record Application增加Verification compact inspect projection，复用既有body manifest/digest完整性验证
- [x] 3.2 登记`task execution-record list`与`inspect` CLI、帮助、参数白名单和非JSON简洁输出
- [x] 3.3 登记list/inspect与active duplicate的closed public JSON schema，更新JSON contract文档与package parity
- [x] 3.4 增加Task隔离、open/retained/cleaned、正文不可用、完整性失败及原终端丢失后按Task恢复的CLI/System测试

## 4. Agent工作方式与当前认知

- [x] 4.1 更新`task-verification` Skill，使Agent在工具session丢失时先list/inspect同一次execution，禁止无判断整轮重跑
- [x] 4.2 更新Buildr Service当前认知与Change Brief，说明invocation identity、active duplicate与CLI readback边界；术语检查保持现有“验证执行/任务执行记录”边界
- [x] 4.3 对照实现执行current knowledge reconcile与inspect，清除`.buildr/knowledge-impact.yml`中的pending/unresolved影响

## 5. 直接验证与archive readiness

- [x] 5.1 运行migration、domain/Application、Verification、CLI/JSON与Skill focused tests，修复所有回归
- [x] 5.2 运行一次真实长execution恢复fixture，证明session句柄不再是结果authority，默认重复调用不会启动第二个capability process
- [x] 5.3 运行affected verification、`openspec validate stabilize-verification-execution-readback --strict`及知识/术语一致性检查
- [x] 5.4 核对proposal、design、specs、tasks、brief、knowledge impact与最终实现一致，达到convergence/archive readiness
