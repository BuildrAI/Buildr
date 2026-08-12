## 1. Expected-tree OpenSpec validation

- [x] 1.1 把 deterministic apply 的 expected files 投射到最小 temporary Project surface，并绑定 OpenSpec executable/version 与完整 digests
- [x] 1.2 在任何 canonical replace 前执行 expected-tree strict validation，失败时保持整批零写入并返回结构化 fallback
- [x] 1.3 增加新 capability 缺少 Purpose、Requirements、Purpose 不完整及合法骨架的单元/集成回归测试

## 2. OpenSpec contract fixture 性能

- [x] 2.1 将 contract fixture runner 拆为 identity-bound preparation producer 与隔离 assertion consumers
- [x] 2.2 实现 run-local prepared artifact、只读复用和写入型 scenario 的 copy-on-write/独立副本，验证污染与 identity drift fail closed
- [x] 2.3 在 verification registry/scheduler 中登记 producer/consumer artifact dependency，消除同一 run 的重复 preparation
- [x] 2.4 输出 preparation、assertion、queue、cleanup、reuse timing 与 diagnostic evidence，并把 family 目标预算设为 20 秒
- [x] 2.5 运行重复样本定位 slowest assertions，确认 strict coverage 与失败 fixture retention 没有退化

## 3. Task Finish identity recovery

- [x] 3.1 定义并登记版本化 recovery manifest/JSON contract，覆盖 environment、candidate、target、runtime、change、assurance 与 transition evidence
- [x] 3.2 实现状态机原子失效计算、running attempt/lease 终结、有效 evidence 保留与 typed transition fail-closed 分类
- [x] 3.3 增加 `task finish recover` application/CLI，并让同一 safe executor连续推进可确定性重建步骤到 formal assurance或真实阻塞边界
- [x] 3.4 覆盖 implementation-changed、archive-sensitive metadata、runtime-projection-only、未知变化和重复 recover 的状态机/CLI 测试

## 4. Diagnostics 与完成计量

- [x] 4.1 建立 run-local append-only observation ledger，记录 Buildr-owned command/handler/stage 的 identity、cwd、timing、exit、原始输出 bytes 与 diagnostic reference
- [x] 4.2 让 compact blocked result解析登记 child JSON并保留stage、code/status、bounded findings/nextActions与full diagnostic digest/path
- [x] 4.3 更新 completion receipt metrics，区分product execution、orchestration gap、unobserved intervals与`product-complete|product-partial|external-unobserved` coverage
- [x] 4.4 增加大输出、非结构化失败、手工checkpoint gap和cleanup后durable receipt的兼容测试

## 5. Runtime assets 与当前认知

- [x] 5.1 更新 Task Finish Skill、capability contract、CLI help/architecture和OpenSpec Component contribution，使用recover与新diagnostic/metrics语义
- [x] 5.2 更新 `brief.md`、OpenSpec lifecycle flow和Task Finish优化任务看板，保持术语与责任边界一致
- [x] 5.3 运行 current knowledge reconcile/inspect并清空 unresolved impacts

## 6. Verification 与真实 benchmark

- [x] 6.1 完成单元、contract、integration-fast与OpenSpec strict affected验证，记录各family真实wall-clock
- [x] 6.2 运行首次成功、candidate修订恢复、formal失败后修复与runtime projection closeout benchmark，核对复用、副作用去重和metrics coverage
- [x] 6.3 对比上一轮22分13秒/324.851秒waste与本轮正常路径，确认OpenSpec fixtures约20秒、Task Finish约3分钟目标或记录剩余瓶颈

## Implementation verification notes

- 聚焦实现测试：Task Finish/OpenSpec unit、Task Finish contract/CLI、CLI architecture 共 58 项通过；package check通过。
- OpenSpec strict：本Change有效，50个active/canonical items全部通过。
- OpenSpec contract fixtures重复wall-clock为14.520秒、17.379秒和17.156秒，均低于20秒预算；旧基线为81.15–90.174秒。
- 最终 affected run 总耗时59.239秒并通过；其中OpenSpec contract fixtures为18.435秒，12个consumer复用一次preparation并保持在20秒预算内。
- 两次候选修订后的OpenSpec recovery分别为2.480秒和2.518秒，runtime projection convergence分别为1.655秒和1.686秒；当前有效candidate/effect未重复计数。
- 真实异常路径在最终assurance通过时墙钟为953.191秒、可归因浪费126.578秒、产品执行213.641秒且coverage为`product-partial`。正常产品路径已接近约3分钟预算，但两次完整affected失败、compact诊断未暴露真实contract failure，以及Agent手工checkpoint往返仍是剩余瓶颈。
- 真实finish正常/修订/失败恢复/runtime-only benchmark留在6.2–6.3，随本Change收尾执行，不以状态机微基准替代。
