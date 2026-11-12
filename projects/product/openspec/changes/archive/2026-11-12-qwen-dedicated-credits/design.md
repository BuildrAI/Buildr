## 设计

### 解析位置

在 `observeQoderQuota` 内与套餐、资源包窗口同层解析 `dedicatedResourcePackages`，复用现有 `positive`、`quotaNumber`、`quotaPercent`、`creditAmounts` 与 `remainingPercent` 辅助函数，不新增独立观察流程。

### 窗口构造

- 仅处理 `Array.isArray(data.dedicatedResourcePackages)` 中的对象项，且 `available === true`；其他值或已过期项直接跳过。
- 标识为 `dedicated:<资源包 id>`；缺失 `id` 时使用 `dedicated:<数组索引>` 保证同一响应内唯一，不生成随机值。
- 名称读取 `displayLabels` 中 `dimension === 'title'` 的项，依次取 `valueI18n['zh-CN']`、`value`，都缺失时回退“千问专属积分”；`description` 不参与窗口。
- 剩余比例优先按资源包总量与剩余计算，兼容 `total` 与 `cap` 两种总量字段；数量缺失时按平台 `percentage`（已用比例）换算；比例完全未知时不生成该窗口，与既有窗口的未知处理一致，不把未知当作零余额。
- 剩余与总量同时已知时写入 `remainingCredits` 与 `totalCredits`，不推算缺失值；`resetsAt` 取资源包 `expiresAt`。

### 聚合边界

专属积分只在对应模型系列内抵扣，因此：

- 不把专属包加入 `buckets`，`combined` 与账号级 `remainingPercent` 保持只由套餐、资源包与组织资源包计算。
- 不改 `isQuotaExceeded` 与 `modelQuotaFailure` 的判定路径。
- `summary` 继续描述账号级套餐与资源包；专属包只在 `windows` 中独立展示，避免被误读为账号通用额度。Web 现有渲染按 `windows` 通用展示，无需改动。

### 兼容与风险

- 新增窗口标识不与既有 `credits`、`add-on`、`org-package` 冲突；现有消费方没有按标识分支，新增窗口是增量数据。
- 平台字段可能缺失：所有读取都按未知处理，不伪造数值，也不把未知当作零余额。
- 若平台未来把专属包并入通用额度，本实现仍只展示原始资源包事实，账号级聚合不会重复计算。
- 回滚只需移除新增解析与对应测试，规范回退到原要求。
