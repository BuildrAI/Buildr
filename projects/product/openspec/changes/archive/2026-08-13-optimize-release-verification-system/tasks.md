## 1. 分布式候选契约

- [x] 1.1 在统一 verification registry 中声明 Candidate shard、runner/platform、primary coverage unit、允许的平台复验和 Host Node tuple，并增加完整性/漂移测试
- [x] 1.2 定义 candidate artifact、shard/Host Node evidence 与 aggregate result 的 closed schema、identity 校验和缺失/重复/stale 失败测试
- [x] 1.3 保持本地完整 `test:candidate` 的全部 step 集合，增加分布式计划与旧 Candidate coverage map 等价性断言

## 2. 候选 runner 与制品复用

- [x] 2.1 实现 candidate preflight、artifact producer、shard run、Host Node evidence 与 aggregate CLI，全部从 registry 解析计划
- [x] 2.2 扩展 verification executor，使外部 `buildr.release-artifact/v1` 可只读注入并被 consumer 复验，收到外部 artifact 时禁止重新 pack
- [x] 2.3 为 source SHA、registry identity、artifact digest、primary/dependency step 和 timing evidence 增加 unit/integration/contract 覆盖

## 3. 高成本生命周期可观察性

- [x] 3.1 为 release smoke 增加准备、安装、Web/Launcher 状态演进、Workspace lifecycle、卸载/最终 Doctor 与 harness cleanup 阶段 timing
- [x] 3.2 为 fresh build 增加 checkout/preparation、Buildr npm ci、Buildr Web npm ci、build:web 与 harness cleanup 阶段 timing
- [x] 3.3 固化 cleanup 分类：产品 owned resource cleanup 失败继续阻塞，断言完成后的 Windows harness temp root 暂态占用只 warning 并保留路径

## 4. GitHub 候选拓扑

- [x] 4.1 重构 `verify.yml`：精确 checkout PR head SHA，preflight 短路，单 artifact producer，macOS core、三个 Windows shard、当前 Host Node matrix 和 `if: always()` aggregate gate
- [x] 4.2 增加 `dev` push changed/affected反馈和适用Windows高风险反馈，不将其标记为完整 Candidate
- [x] 4.3 增加 workflow contract 测试，证明 job dependency、artifact传递、evidence upload、失败 aggregate与稳定check name

## 5. 发布工作方式与当前认知

- [x] 5.1 通过 capability-adaptation 更新 `buildr-release` 产品源 Skill：普通发布准备复用 changed/affected，GitHub aggregate 是正式 Candidate，明确本地完整 Candidate 的例外条件
- [x] 5.2 更新 release checklist、verification ownership及相关测试，并核对Project verification declaration无需登记CI内部shard，使开发反馈、候选门禁和tag发布物authority分离
- [x] 5.3 创建并维护 `brief.md` 与 `.buildr/knowledge-impact.yml`，核对并更新受影响的 Buildr Service/current technical/release flow knowledge；无真实术语变化时记录 glossary not-applicable

## 6. 收敛与实测

- [x] 6.1 运行 strict OpenSpec、registry/workflow contract、fast、changed/focus和本地完整 Candidate，修复全部正确性回归并核对完整 coverage
- [x] 6.2 在同一冻结 source SHA 上执行至少三轮分布式 GitHub Candidate，记录各 shard、总wall-clock、runner minutes、中位数、波动和失败job重跑成本
- [x] 6.3 新 `candidate-gate` 完成实际绿色回读后迁移 `main` branch protection，随后删除旧四个required contexts并验证保护规则
- [x] 6.4 完成 current knowledge reconcile/inspect、OpenSpec strict validation与 deterministic convergence/archive readiness
