## Context

额度的唯一结构化事实来自智能体服务的 `ModelQuotaObservation`，经 HTTP `AgentModelAccount.quota` 提供给 Buildr Web。Qoder `/usage` 的 `userQuota`、`addOnQuota` 与 `orgResourcePackage` 已同时给出剩余、总额与百分比；当前观察只把百分比放进 `windows`，把数量拼进人读的 `summary`。Web 额度浮窗直接按接口返回顺序渲染账号，模型设置页的额度卡片使用 `windows` 的百分比。

## Goals / Non-Goals

**Goals:**

- 让额度窗口在保留百分比的同时携带可渲染的剩余与总量数量，两个界面使用同一事实。
- 让额度浮窗的来源顺序与“模型”页来源列表一致，不随刷新或接口顺序变化。
- 保持 HTTP 契约向后兼容，未知数量不显示为 0。

**Non-Goals:**

- 不改变额度读取失败、耗尽判定、模型目录或登录行为。
- 不为百分比窗口推算 credits 或统一换算其他单位。
- 不引入新的额度存储或前端状态仓库。

## Decisions

### 额度窗口增加可选的 `remainingCredits` 与 `totalCredits`

`ModelQuotaObservation.windows` 与 HTTP schema 增加两个可选数值字段，由 Qoder 观察在取得剩余和总量时填充；Web 在字段同时存在时显示“剩余 / 总量 credits”。

- 理由：数量与百分比来自同一次解析和同一观察时间，结构化字段避免 Web 解析 `summary` 文案，也使模型设置页每个窗口能独立表达数量。
- 兼容：字段可选，旧 DTO、旧响应与其他来源不受影响；`additionalProperties: false` 的 schema 同步更新后重新生成 DTO。
- 备选：解析 `quota.summary` 或把数量拼进窗口 `label`。前者依赖人读文案格式，后者把数值当展示字符串，无法在设置页稳定对齐窗口，均不采用。

### 来源顺序复用“模型”页的来源名称规则

从账号派生来源显示名称（API Key 来源为 `ChatGPT API`，其余优先账号分组名称，再回退 provider 标签），使用与 `modelSourceViews` 相同的 `Intl.Collator('zh-Hans-CN',{sensitivity:'base',numeric:true})`；同一来源按账号名、最后按账号 ID 排序。共享 helper 避免两处映射漂移。

- 理由：两处列表展示同一来源集合，顺序一致可减少认知切换；`ChatGPT` 与 `ChatGPT API` 相邻，`Qoder` 与 `Qoder CN` 按名称先后。
- 备选：按接口返回顺序或按登录时间。均不稳定，且不满足按来源名称排序的目标。

### 数量展示格式

额度浮窗的百分比行保持 `窗口 · 剩余 59.2%`，在其下以次级小字显示 `1,599 / 2,700 credits`；模型设置页在原有百分比下方、重置时间右侧显示同一数量。仅在两个数值都存在时显示，避免把未知当零。

## Risks / Trade-offs

- [上游把数量改为字符串] → 当前 `quotaNumber` 只接受有限数值；字段缺失时退回百分比，不显示伪造数量。
- [新增字段被旧客户端忽略] → 可选字段属于增量兼容，旧客户端继续只看百分比。
- [排序改变用户熟悉的顺序] → 与“模型”页一致后顺序可预测；同一来源内仍按账号名稳定排序。
- [契约生成物未同步] → 通过契约生成脚本重建 DTO 并以类型检查验证。

## Migration Plan

1. 更新智能体服务契约、schema 与 Qoder 观察，重新生成 `agent-service-http-dto`。
2. Buildr Web 共享展示 helper 与两个界面接入，先保留旧数据兼容路径。
3. 回滚时移除新增可选字段即可，旧观察和百分比路径保持可用，无需数据迁移。
