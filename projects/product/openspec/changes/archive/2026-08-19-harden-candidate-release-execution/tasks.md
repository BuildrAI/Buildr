## 1. Runner lifecycle 与 evidence

- [x] 1.1 为 registry step 增加独立 timeout contract和分档校验，保持 timing budget非阻断语义。
- [x] 1.2 实现 capability spawn/heartbeat/immediate completion事件以及 stdout/stderr/phase digest。
- [x] 1.3 实现 timeout/cancel 的 TERM→KILL process-group/descendant回收与确认。
- [x] 1.4 实现原子 Candidate checkpoint，保持 aggregate只接受完整 terminal shard evidence。
- [x] 1.5 增加永久不退出且派生后代的确定性测试，验证超时、日志、checkpoint和零残留。
- [x] 1.6 增加 retained `currentProductInvocation` delivered CLI不变量与防递归回归测试。

## 2. core-macos 分片与采样

- [x] 2.1 将权威 core-macos集合投影为四个语义 shard并更新 verify workflow/artifact/aggregate wiring。
- [x] 2.2 为 Task Finish delivery和self-bootstrap收敛 workspace-saturating声明与inner concurrency。
- [x] 2.3 增加 registry/workflow唯一 owner、artifact、needs、aggregate输入与saturating互斥 contract tests。
- [x] 2.4 增加 process lineage benchmark并记录50ms baseline。
- [x] 2.5 以同一 harness评估250ms/200ms采样策略，仅在正确性不变且成本下降时保留。

## 3. exact Node 与 Release 环境

- [x] 3.1 实现共享 exact Node execution environment helper和closed audit identity。
- [x] 3.2 迁移 Candidate executor、Task Finish子进程和release smoke/helper到同一 executable/PATH contract。
- [x] 3.3 增加错误 executable、fake PATH Node、错误 cwd和缺失 Service lockfile测试。
- [x] 3.4 更新 buildr-release Skill只消费Task Environment Plan/Receipt与Service recipe，删除Product根 `npm ci`。
- [x] 3.5 让publish workflow从冻结 source在Buildr Service root按Environment binding重建并fail closed核对。

## 4. Release transaction 可追踪性

- [x] 4.1 定义 release transaction context/evidence/inspect closed schema与稳定digest。
- [x] 4.2 让runner通过Application/GitHub/Git read model验证release/support Task、retrospective、Candidate、bridge和Environment facts。
- [x] 4.3 让publish workflow在既有release evidence artifact增量/最终写入tag、npm、GitHub Release与Registry smoke facts。
- [x] 4.4 实现按publish run读取、下载、校验并返回portable关联的inspect read model。
- [x] 4.5 增加schema/read-model、缺失/跨run/drift以及公共写入前失败恢复测试。

## 5. 文档、知识与验证

- [x] 5.1 更新release checklist、verification/release current knowledge与相关CLI/contract文档。
- [x] 5.2 运行OpenSpec strict、Static、Unit、Component、Contract、Integration、System和changed/focused验证并修复回归。
- [x] 5.3 运行多轮同tree sampler/Candidate timing，报告前后止损、分片和累计验证耗时。
- [x] 5.4 运行完整Candidate，确认覆盖不减少、macOS全部通过且aggregate继续fail closed。
- [x] 5.5 同步current knowledge并确认deterministic convergence/archive前置；Formal Verification、Task Candidate、Completion Review、handoff与Task Finish由Change checklist后的独立lifecycle处理。
