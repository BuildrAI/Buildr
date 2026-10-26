# 设计

## 决策

### 保留 `AGENTS.md` 层级与 `rules render`

`rules render`、`rules-entry` 适配能力和 `AGENTS.md` 递归发现已经承担 runtime 规则投射；它们不使用 `rules/manifest.yml`。退役只移除 manifest 登记、`rules add/remove`、组件 Rule 成员和内置 Rule 资产，不改变 `AGENTS.md` 发现、受管区块或 Claude Code 引用桥等现有投射行为。

### Rule manifest 只读退役

`rules/manifest.yml` 与 `rules/*.md` 作为存量用户资产保留：Buildr 不再创建、写入、同步或自动删除它们。doctor 负责发现非空登记项、不可解析 manifest 或 `rules/*.md`，给出 warning 和迁移指引，但不把该 warning 升级为 workspace 读取失败。这样既不静默丢失用户内容，也避免为了清理旧机制引入不可逆迁移。

### 命令与 HTTP 入口退役

`rules add/remove` 从 CLI 路由和 HTTP catalog 中移除。CLI 对旧命令返回稳定的退役诊断（类似既有 `connection` 退役处理），而不是普通 unknown command；HTTP 对旧路径返回不支持/退役响应，不进入 manifest writer。`rules render` 保持可用。

### 组件 Rule 成员的兼容策略

Component 定义中的 `members.rules` 作为退役字段处理：

- 空数组可读，但在解析后忽略，不物化成员、不写 Rule manifest，也不再由渲染器输出；
- 非空数组在 Component check、install 与 `buildr package check` 中失败，并提示把规则正文迁移到 `AGENTS.md`。

这避免把现有 `members.rules: []` 定义全部判为无效，同时不会静默丢弃真正的 Rule 成员。

### 内置 Rules 完全移除

`builtins.rules`、内置 Rule 同步/卸载/恢复、`rules/buildr/` 发布边界和 package-check 的 Rule CRUD 验证一并移除。包内 OpenSpec Component 的空 `rules` 字段同步删除。内置 invariant 指引继续由根 `AGENTS.md` 承担；任务触发型指引继续以内置 Skills 发布。

### doctor 输出与 Web

doctor 继续输出 `workspace.requiredBlock`；`rules` 字段改为退役摘要（manifest 存在性、登记项数量和规则文件数量），不再暴露可消费的 Rule manifest 状态。Agent Assets inventory 不再包含 `rules`，Buildr Web typed client 移除 `addRule`/`removeRule`，避免继续暴露已退役写入口。

## 兼容与迁移

| 存量对象 | 行为 |
|---|---|
| 空 `rules/manifest.yml` | 保留，不产生 warning，不读取 |
| 非空 `rules/manifest.yml` | 保留，doctor warning + 迁移指引 |
| `rules/*.md` | 保留，不自动删除；doctor warning + 迁移指引 |
| `members.rules: []` | 兼容读取并忽略；下次 Component 更新不再写出该字段 |
| 非空 `members.rules` | Component/package check 失败，提示迁移到 `AGENTS.md` |
| `builtins.rules` / `rules/buildr/*.md` | 当前包不再声明或发布；package check 拒绝重新出现 |

迁移由用户按 doctor 指引把需要生效的规则正文移入对应作用域的 `AGENTS.md`。Buildr 不自动改写、删除或复制规则正文。

## 风险

- 旧脚本或 Web 调用 `rules add/remove` 会失败；需要明确迁移信息，而不是静默成功。
- 现有 workspace 的 Rule manifest 内容不再生效；doctor warning 是唯一提醒渠道，因此 warning 必须可操作且不阻断其他工作。
- 移除 inventory `rules` 与 HTTP DTO 会影响生成的前端类型；需要重新生成 DTO 并更新 Web typed client。
- package-check 和测试中大量 Rule CRUD 断言需要改为退役断言，否则会出现验证与规范不一致。
- 自举工作空间的根 `AGENTS.md` 受管区块需要随产品源同步，否则 doctor 会报告受管区块不一致。

## 未采用方案

- **保留空 `rules/manifest.yml` 生成**：仍会暗示存在 Rule registry，且需要持续维护 schema 与诊断，没有使用方收益。
- **自动迁移 `rules/*.md` 到 `AGENTS.md`**：无法可靠判断规则作用域、优先级和用户意图，可能改变规则语义。
- **自动删除旧 Rule 文件**：违反存量资产保留边界，且可能删除用户正文。
- **保留 `builtins.rules` 但置空**：包清单仍会暴露一个空机制，package check 和生命周期代码仍需分支，退役不彻底。
