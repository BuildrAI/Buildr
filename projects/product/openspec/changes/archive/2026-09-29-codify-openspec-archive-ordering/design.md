# Design: codify-openspec-archive-ordering

## Context

归档时点方案已在维护者讨论中确认，本 design 只记录落地决策，不重新论证。

## 关键决策

### 决策 1：判断时点固定为"变基之后、converge 之前"

主规格漂移审查与 preflight 挂在候选冻结序列：变基主线 → 按验证适用性重跑受影响验证 → preflight + 主规格漂移审查 → 冲突分类处理 → 冻结候选。收尾时若主线未再前进（工作树仍为最新主线提交加本任务），复用已有判断；需要重新变基时重新执行。

理由：变基是主线规格"在任务期间被推进"的唯一暴露时刻；这也是发现语义冲突最后一个便宜时点，再往后就是 converge 时响亮失败（返工）或静默覆盖（冲突固化进主规格）。

### 决策 2：归档授权判定委托任务收尾交付语义

task-finish 的"交付成果"已包含"适用的规范归档"，配合"收尾即授权常规 Git 提交、集成和普通推送"与"已取得授权不因换轮次重复确认"，收尾默认包含归档。apply 增强原文"仅在用户目标包含归档时调用 converge"让两个技能各自定义归档授权判定，改为委托：apply 阶段自身不归档，归档授权按 task-finish 交付语义判定。

### 决策 3：不新增 CLI 能力

- converge 内部已有试归档（`upstreamConvergencePlan` 对当前主规格构建合并结果并校验，plan blocked 零写入），不需要独立 dry-run 入口。
- preflight 保持无 Git 依赖；主规格漂移审查是 Agent 只读动作（`git diff <任务基点>..HEAD -- openspec/specs/<触及 capability>/`），不产品化到工具。实测有漏报再评估增强。

### 决策 4：冲突分类按处理者划分

| 类别 | 特征 | 处理 |
|---|---|---|
| 基线陈旧 | 工作树落后主线导致 active 集合过期 | 重新变基后重跑预检 |
| delta 失配 | plan 阶段 `upstream-spec-invalid`：触及 requirement 在最新主规格不存在 | 回到 change artifacts 修订 delta |
| 语义冲突 | 同一 requirement 被其他已归档变更实质性改写，MODIFIED 会静默覆盖 | 意图不可共存时请求用户决定 |

`recovery-unprovable` 类不属于上述分类，按 `convergence inspect` 恢复口径处理。

## Risks / Trade-offs

- 漂移审查依赖 Agent 自觉执行（无工具强制）→ 以规格 MUST 文本 + 技能注入文本双重承载；若实测漏报再评估 preflight 产品增强。
- [按本规格既有边界] 不修改 runtime 行为，contribution 文本是渲染资产，属正常产品变更。
