## 1. 收敛事务核心模型

- [x] 1.1 定义单一 convergence identity、plan 和 receipt schema，绑定 delta、canonical before/expected、executable 与 algorithm version
- [x] 1.2 将纯 planner 从 OpenSpec domain 拆出，移除对持久化 baseline 和 sync-plan sidecar 的正常路径依赖
- [x] 1.3 实现 observer，仅按实际文件 digest 返回 `planned-not-applied`、`applied-and-matched`、`state-unknown` 或 `archived`

## 2. 隔离验证与条件式应用

- [x] 2.1 拆分 projected validator，在 task-owned 临时 Project 投射 expected files并运行绑定 executable 的 strict validation
- [x] 2.2 拆分 canonical applier，写入前重验 delta、executable 和全部 before digests，准备完整批次后条件式原子替换
- [x] 2.3 实现写后 digest/strict confirmation、进程中断恢复和状态不明关闭式失败

## 3. 单一产品入口与兼容迁移

- [x] 3.1 实现 openspec-converge orchestrator，固定 plan、projected validate、apply、confirm 与 `archive --skip-specs`
- [x] 3.2 只写 `.buildr/convergence-receipt.json`，报告 `passed|blocked|recovery-unprovable`、耗时和命令次数
- [x] 3.3 增加旧 baseline、pre-sync、sync-plan、convergence/recovery receipt 的只读兼容判断，证据不足时 fail closed
- [x] 3.4 保留旧 CLI 诊断兼容，但移除 Task Finish、Skill、文档与新 fixture 对旧阶段编排的依赖

## 4. Task Finish 依赖边界

- [x] 4.1 将 `contract-convergence.openspec` action 收敛为一次 `buildr openspec converge` 调用和三结果映射
- [x] 4.2 建立轻量 Task Finish checkpoint bootstrap，避免加载 OpenSpec/Git/runtime domain
- [x] 4.3 在 domain 模块语法错误或 Git 冲突时，验证 checkpoint仍可记录blocked、终结attempt并精确释放lease

## 5. 完整 journey 与并发验收

- [x] 5.1 覆盖正常同步归档、strict失败零写入、plan后canonical并发修改和重复执行幂等
- [x] 5.2 覆盖apply成功receipt未更新退出、部分文件异常进入state-unknown、delta/executable identity变化
- [x] 5.3 覆盖archive失败后只重试archive、旧sidecar兼容/不可证明、OpenSpec损坏时Task Finish checkpoint
- [x] 5.4 覆盖两个Change修改同一Requirement blocked，以及两个不相交Change经重新规划各自安全收敛
- [x] 5.5 将真实journey登记到verification registry并保留现有contract fixtures覆盖

## 6. 产品资产与验证

- [x] 6.1 收敛 Brief、OpenSpec lifecycle flow、Buildr Service current knowledge、CLI文档与受管Task Finish/OpenSpec指引
- [x] 6.2 运行聚焦单元/集成journey、OpenSpec strict与旧contract fixtures，修复所有回归
- [x] 6.3 运行selected task-verification provider要求的受影响正式验证并记录候选identity、范围与wall-clock evidence
