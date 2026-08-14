## 1. 契约与当前认知

- [x] 1.1 将proposal、design、brief、delta specs和tasks收敛为中文，并只保留`task-finish-execution`、`cli-product-surface`与`product-agent-skills`三个真实变化的capability。
- [x] 1.2 更新Task Finish Skill、contract、CLI help与产品文档，明确provider依赖闭包、单独授权、非sandbox和排除边界。

## 2. Retained Application恢复入口

- [x] 2.1 在同一Task Finish Application内解析existing-run bootstrap选项，删除pre-registry recovery dispatcher，并保持普通run/inspect行为不变。
- [x] 2.2 为phase handler异常记录稳定`product-phase-provider`来源，只允许无交付副作用的preflight/prepare provider failure进入恢复。
- [x] 2.3 在capsule创建前用retained Environment与Development authority证明execution root、handoff、Candidate/generation及Content Target current。

## 3. Run-owned capsule与权限边界

- [x] 3.1 在Execution Record open gate后创建或精确接管deterministic detached capsule，并把authority manifest保留在source checkout外。
- [x] 3.2 首次及每次resume都核验完整HEAD、tree、cleanliness、provider path/digest与manifest identity，拒绝caller source/module/manifest/tarball和任何identity drift。
- [x] 3.3 让candidate provider只接收精确allowlist retained runtime façade，同时由retained Application/repository/state machine保存全部canonical run transition。

## 4. Same-run恢复与cleanup

- [x] 4.1 在同一run重置合格failed phase、保留原attempt provenance，并让blocked恢复继续使用current Product resume token与同一capsule。
- [x] 4.2 在cleanup phase持久化passed后由retained finalizer撤销source authority，使用外置manifest、deterministic quarantine与tombstone闭合崩溃窗口。
- [x] 4.3 支持capsule撤销后terminal SQLite finalize失败的retained-only same-run resume，不重新import provider或重放已通过phase。

## 5. Result与回归覆盖

- [x] 5.1 在full/compact Result和Execution Record中追加最小bootstrap provenance、原failure、source/capsule identity、revocation与`bootstrapRecoveryExecutions`，保持formal Verification count为0。
- [x] 5.2 增加qualification、Environment/Development drift、dependency drift、record gate、retained writer/façade、failed/blocked same-run与forbidden input的focused测试。
- [x] 5.3 增加capsule创建/接管、撤销各崩溃窗口、residual attention、terminal-only resume和普通Finish无回归的integration/contract测试。
- [x] 5.4 运行最小affected development feedback，修复真实失败并完成current knowledge reconcile。
