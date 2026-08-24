## 1. 建立可执行审计模型

- [x] 1.1 扩展唯一 verification registry 的 evidence metadata，为日常 Core 慢 Integration/System owner 声明公共结果、反例与唯一 primary evidence owner
- [x] 1.2 实现 evidence map contract，验证 primary/supporting 关系闭合、慢 owner 元数据完整和真实黄金边界至少保留一个 primary owner
- [x] 1.3 实现 Release-only 日常 Core 闭合检查，区分日常 `core` profile 与 Candidate CI `core-*` macOS shard

## 2. 审计 changed/affected 选择

- [x] 2.1 实现只读 selection audit，复用 changed paths、ownership authority 和 planner 输出直接 owner、依赖扩张、step count、scope/Full reason 与目标工作量
- [x] 2.2 为稳定 synthetic changed paths 增加 contract cases，证明普通领域最小 affected DAG、execution semantics Full 升级和缺失 ownership 诊断
- [x] 2.3 抽取近期代表性普通任务的 immutable Git 样本，记录改动、owner、最终 steps、Full 原因与 selection amplification

## 3. 去重跨层证据

- [x] 3.1 逐个审查慢 Integration/System owner 的测试文件、公共结果与反例，标明 primary 或 supporting 及保留理由
- [x] 3.2 仅对反例充分且 coverage 闭合的重复事实转移 primary evidence 或收窄 ownership/Core membership
- [x] 3.3 验证 Candidate 文件并集、唯一 owner、代表 changed paths和Release exclusions在调整前后不退化

## 4. 形成残余成本输入

- [x] 4.1 输出 affected 选宽、必要 owner 过重和环境竞争的分离结论，以及 Finish、Workspace、Worktree、Candidate和进程残余黄金 owner 清单
- [x] 4.2 基于当前目标与实测重新计算总工作量、依赖关键路径、资源容量数学下限和诚实预算假设
- [x] 4.3 更新验证框架与Service当前认知，记录哪些owner去重、保留或留给后续执行路径优化

## 5. 验证与收敛

- [x] 5.1 运行 registry/planner focused contract、稳定反例和审计命令验证
- [x] 5.2 运行适用 changed/affected 验证并核对 Execution Record、选择原因和Release-only排除结果
- [x] 5.3 执行 OpenSpec strict validation、current knowledge reconcile与Change convergence
