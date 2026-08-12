## Context

`task finish run` 在 `task-finish-application` 创建 run 前顺序 `throw`：Environment ready → Development handoff current → Workspace Node → target branch → agent 匹配 → delivery remote。任一失败即停。run 内 `preflight` 已聚合 checks，但多数「收尾」失败发生在入口，Agent/人看不到后续模块缺口。

约束：谁的内容谁检查；Finish 不读 Change/Verification/Review store；有研发缺口不创建 Finish run。

## Goals / Non-Goals

**Goals:**

- 入口一次观察当前可解析的 Environment / Development / 交付事实，汇总后再失败。
- 缺口按 `development` | `environment` | `delivery` 分类暴露。
- 存在 `development` 缺口时：不创建 run、不 open execution record、`nextWorkflow`/`suggestions` 指向 `task-development`。
- CLI JSON 错误可机读分类明细。

**Non-Goals:**

- 不新增独立检查器或四硬门（clean commit / change archived / 等）。
- 不改变五阶段顺序或 run 内 prepare/verify/deliver 的 fail 语义（阶段内昂贵副作用仍可按阶段边界停止）。
- 不在 Finish 入口二次审计 OpenSpec archive 或 Verification Result 正文。

## Decisions

1. **聚合位置 = run 创建前入口，而非重写各模块**  
   抽取 `observeTaskFinishEntryReadiness`（或等价），对现有 `resolveTaskEnvironmentExecution`、`inspectTaskDevelopment`、target/remote 解析等做非短路收集。模块算法不变。

2. **分类映射（固定）**  
   - `environment`：Environment 未 ready / adapter 不匹配 / receipt-bound Workspace Node 不可用等。  
   - `development`：handoff missing/stale/无法解析 current immutable snapshot。  
   - `delivery`：target branch 不可用或不一致、delivery remote 缺失/歧义。  
   单一 finding 只进一个模块；复用既有 error code 作为 finding.code。

3. **失败契约**  
   - code：`task_finish.entry_gaps`（汇总）；details 含 `gaps: { development, environment, delivery }`（数组，可空）与 `nextWorkflow`。  
   - 若 `development.length > 0` → `nextWorkflow: task-development`，即使同时有环境/交付缺口。  
   - 仅环境/交付缺口 → 不创建 run，next 指向修复对应模块（不冒充 Development）。

4. **CLI**  
   `reportCliFailure` 在 `--json` 且存在 `error.details` 时原样放入 `error.details`，保持 `buildr.cli-error/v1`。

5. **Skill**  
   「调用前」改为依赖产品入口聚合结果；禁止 Agent 自行 Environment→handoff 链式提前 return 而丢掉其它已观察缺口（产品已聚合时以产品结果为准）。

## Risks / Trade-offs

- [依赖单错误码的脚本] → 文档标明 BREAKING；保留各 finding 原 code 便于映射。  
- [入口聚合变贵] → 只跑现有廉价观察，不引入网络 push/fetch。  
- [与 run 内 preflight 重复] → 入口管「能否建 run」；preflight 管「run 已绑定 identity 后的复核」。允许重叠事实，禁止第二套语义。

## Migration Plan

- 同版本发布；无数据迁移。  
- 消费方改读 `error.details.gaps`；旧单码路径仅保留参数语法类错误。

## Open Questions

- 无。用户已拍板：模块检查器不变、查完再失败、按模块分类、有研发缺口不建 run。
