## 1. 契约与直接替换骨架

- [x] 1.1 直接更新 `buildr.task-finish-run/v1`、五阶段模型、唯一 canonical run store、freeze/resume/result schema；不建立并行版本目录或状态迁移模块
- [x] 1.2 将 Task Finish CLI 参数和帮助收敛到唯一 `run|inspect` 表面，删除旧 action、旧状态机与旧公共 schema
- [x] 1.3 更新 `buildr.task-finish/v1` capability contract、随包 Task Finish Skill、manifest/binding 与产品 routing 文案

## 2. 五阶段执行器

- [x] 2.1 实现无副作用 preflight 聚合器，覆盖 execution binding 真实 CLI probe、OpenSpec/change/knowledge、Git/target、verification policy、retained/cleanup findings
- [x] 2.2 实现 prepare 的 convergence、runtime fixed point、commit/rebase 与 frozen candidate identity，候选变化时终止当前 run
- [x] 2.3 实现 verify 的匹配 evidence 复用或一次正式 executor，并把任何产品缺陷/失败投射为 `upstream-candidate-defect` 与 `task-development`
- [x] 2.4 实现 deliver 的 target fencing/ref transition、普通 push、retained convergence 与 receipt-bound runtime install
- [x] 2.5 实现 retained cleanup finalizer、durable completion 和只恢复 target/retained/cleanup 暂态阻塞的产品 resume token

## 3. 环境就绪与领域服务边界

- [x] 3.1 为 task environment create/context 增加 receipt-bound CLI executable probe 和结构化不可执行诊断
- [x] 3.2 从旧 Task Finish action registry 中抽取或复用 OpenSpec、verification、Git、runtime、worktree 的确定性 application service，确保当前执行器不依赖 Agent provider completion
- [x] 3.3 移除 repair authorization、caller evidence/fingerprint/execution-plan/recovery manifest 和全部旧协议 reader/executor

## 4. 验收与直接替换测试

- [x] 4.1 增加五阶段 unit/contract 测试：preflight 聚合、freeze、单次验证、缺陷终止、target-race resume、cleanup resume 与 primary failure 投射
- [x] 4.2 增加客户端直接替换和 CLI help/JSON schema 测试，证明唯一 canonical store、不存在版本化运行目录，并拒绝旧 run shape、旧 action 与旧 caller-authored 参数
- [x] 4.3 增加真实 task environment 正常路径 journey，断言 CLI=1、Agent completion=0、manual recovery=0、formal verification≤1，并验证 commit/push/retained/cleanup 真实副作用
- [x] 4.4 增加 task environment CLI 缺少依赖时不得返回 `executionReady: true` 的回归测试

## 5. 知识、同步与验证

- [x] 5.1 收敛 Brief、技术架构、Buildr Service 说明、CLI/Skill 文档与术语影响，并运行 OpenSpec strict/proposal contract gate
- [x] 5.2 运行 changed/focused/affected 验证并修复所有发现，确认旧 Task Finish tests、源码和公共入口已删除，且当前客户端只使用唯一 canonical store 并拒绝旧 run shape
- [x] 5.3 建立最终实现候选的完整 Candidate 验收要求：记录 timing、最慢阶段、evidence lifecycle 与 cleanup 状态，并在最终稳定 tree 上执行
