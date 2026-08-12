## 1. Task Finish 解析证据

- [x] 1.1 在 Task Finish Result 投影中生成 additive `resolvedContext` 与确定性 identity，并保持旧 v2 terminal Result 兼容
- [x] 1.2 补充 Result domain、CLI、SQLite terminal readback 与 system journey 测试，证明字段只读且不形成新 authority

## 2. Self-bootstrap closeout runner

- [x] 2.1 实现 Product内部Node runner，从同一 run 的 Finish Result 解析模式、冻结路径和去重动作 plan，并只允许self-bootstrap Workspace Skill调用
- [x] 2.2 实现 sync、精确 successor commit、普通 push/readback、CLI/Local App 安装及 Doctor/same-run resume 的独立结构化阶段
- [x] 2.3 实现基于 run/plan trailer、单一后继、owned paths 与 remote facts 的幂等恢复和 fail-closed 诊断
- [x] 2.4 增加 fresh、not-applicable、commit 后中断、remote 已完成、身份漂移和阶段失败的 runner fixture tests

## 3. Skill 与 Component 接线

- [x] 3.1 更新 `buildr-self-bootstrap-sync` Skill 和 Component contribution，使正常路径只调用一次 runner并保留手工诊断边界
- [x] 3.2 更新 product `task-finish` Skill，明确使用已解析 capability binding直接调用 canonical CLI，并采用宿主有界长等待至终态而非高频轮询
- [x] 3.3 更新 package manifest、Skill integrity/contract checks和runtime projection验证，确保候选脚本能够随Workspace source交付

## 4. 当前认知与直接验证

- [x] 4.1 更新 Change Brief、knowledge impact和受影响的 Buildr Service/流程当前认知，明确runner仍在Formal Finish五阶段之外
- [x] 4.2 运行 OpenSpec strict、runner/Task Finish聚焦测试、package static、Skill projection和受影响产品验证，修复全部直接反馈
- [x] 4.3 核对canonical convergence前的最终artifacts、实现、文档与测试一致，并完成archive readiness检查
