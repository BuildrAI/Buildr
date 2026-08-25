## 1. 声明与执行单元

- [x] 1.1 扩展 Project verification v3 command invocation、Plan schema与identity，解析显式或兼容默认`timeoutMs`，保持v2只读兼容并更新Product declaration、模板和Task Verification指导。
- [x] 1.2 提取Candidate与正式Verification共用的owned-process primitive，实现process group、lineage、TERM→grace→KILL、stdio close deadline和有界输出摘要。
- [x] 1.3 将正式command executor接入resolved deadline、AbortSignal与精确check/failure/cleanup映射，保持现有顶层Execution Record outcome与显式`--retry`兼容。

## 2. Execution Record运行态诊断

- [x] 2.1 为现有`task_execution_records`增加nullable current progress，扩展Domain、Repository、Application和producer-only identity/CAS writer，不新增事件表或正文旁路。
- [x] 2.2 在Verification runner按capability/phase变化和15秒heartbeat更新有界progress，并在terminal seal清除current snapshot、生成最终closed timeline/diagnostics。
- [x] 2.3 扩展Task-scoped CLI/HTTP compact read model与Agent Skill指导，准确展示running progress、timed-out、cancelled和cleanup failure，同时保留recover/unknown authority。

## 3. Browser与Product调度

- [x] 3.1 将Browser dispatcher迁移为异步owned phase runner，记录web-dist、fixture、browser、assertions和cleanup，并为browser/server/preview cleanup提供独立deadline。
- [x] 3.2 将`concurrent-task-acceptance`声明为`workspace-saturating`、`task-lifecycle-heavy`和`app-runtime`，把Preview固定10秒kill改为有界readiness观察与失败诊断。
- [x] 3.3 保持Full capacity=1和required step集合不变，更新registry/ownership/timing契约，确保资源只表达压力节流且不引入主机telemetry门禁。

## 4. 测试与回归证明

- [x] 4.1 增加Unit/Contract测试覆盖timeout schema/default/identity、v2兼容、TERM/KILL/stdio close、progress bounds/redaction/CAS、Product declaration与resource claims。
- [x] 4.2 增加Integration/System回归覆盖忽略TERM、detached descendant、foreign process保留、formal open→progress→seal/producer-loss，以及Browser/Preview成功、timeout和cleanup failure。
- [x] 4.3 运行最低充分focused与affected反馈，证明旧无界场景会被新测试捕获，且Candidate owner集合、Browser selector覆盖和Full capacity没有减少。

## 5. 当前认知与Change就绪

- [x] 5.1 更新Change Brief、技术架构与Buildr Service当前认知，说明正式Verification runtime、Execution Record progress和Browser owned cleanup边界；核对既有术语无需新增glossary条目。
- [x] 5.2 完成OpenSpec strict、spec quality、相关静态/契约审计与实现后diff检查，使Change达到可确定性converge/archive状态；正式Verification、Candidate、Completion Review、Finish和Environment cleanup留在Change外生命周期。
