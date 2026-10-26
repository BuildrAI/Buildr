## Why

Rule 资产目前由 `rules/` 目录、`rules/manifest.yml`、`buildr rules add/remove` 和组件 `members.rules` 共同登记，但产品内没有任何实际使用方：随包组件只有空的 `members.rules`，本工作空间的 `rules: []`，`rules add` 也只登记已存在的文件。核心规则已经内联在根 `AGENTS.md` 受管区块，可选规则加载由 Skill description 与 `skills/manifest.yml` 覆盖。继续保留这条无使用方的登记路径，会让 CLI、HTTP、组件、内置资产、医生和 package 验证持续维护重复职责；现在退役可以把规则来源收敛到已有的 `AGENTS.md` 层级发现。

## What Changes

- **BREAKING**：移除 `buildr rules add/remove` 命令及 `agent-assets/rules` HTTP 写操作；旧调用返回明确的退役说明并指向 `AGENTS.md` 与 `rules render`，不写任何文件。
- **BREAKING**：`buildr init` 不再创建 `rules/` 目录与 `rules/manifest.yml`；workspace 准备不再把这两个路径作为必需资产校验。
- **BREAKING**：Component 定义不再接受非空 `members.rules`；空数组成员按退役字段忽略，安装、卸载和 package check 不再物化或删除 Rule 成员。
- **BREAKING**：移除 `builtins.rules` 与内置 Rule 同步、卸载、恢复和 package-check 验证；随包 OpenSpec Component 定义移除空的 `rules` 字段。
- `agent-assets` inventory 与 source inspect 不再暴露由 Rule manifest 派生的条目；Buildr Web 移除对应的 addRule/removeRule 客户端方法。
- code commit guidance 不再观察或读取 `rules/manifest.yml`，提交语言仍从 `AGENTS.md` 层级读取。
- doctor 不再要求 Rule manifest 存在；对存量 `rules/manifest.yml` 登记项和 `rules/*.md` 给出 warning 与迁移指引，且不阻断其他诊断或工作。
- 根 `AGENTS.md` 受管区块的两处 Rule manifest 引用改为 `AGENTS.md` 层级读取语义；`rules render`、`rules-entry`、`AGENTS.md` 发现与受管区块保持不变。
- 已有工作空间的 `rules/manifest.yml` 与 `rules/*.md` 保留不删、不改写；迁移由用户按 doctor 指引完成。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `root-organization-workspace`: 初始化不再创建 Rule manifest；移除 Root Rules manifest CLI 维护要求；增加 Rule 资产退役、存量保留与 AGENTS.md 规则读取语义。
- `workspace-first-runtime-projection`: runtime 准备与 Agent 规则读取不再依赖 `rules/manifest.yml`；规则只来自 `AGENTS.md` 层级发现。
- `agent-readable-doctor`: 医生不再要求 Rule manifest 对齐，改为报告已退役 Rule 资产的迁移提示和 Skills manifest 对齐。
- `buildr-package-assets`: package 不再声明或校验内置 Rules；package check 与 MVP 验证覆盖 Rule 命令退役和 no-builtin-Rules 边界；初始化映射不再生成 Rule 资产。
- `product-agent-skills`: Buildr Skill 引导 Agent 直接维护 `AGENTS.md` 正文，不再使用 `rules add/remove` 或 Rule manifest description 索引。
- `managed-components`: Component 成员类型移除 Rules，非空 `members.rules` 明确失败，空数组成员兼容忽略。
- `organization-model`: Organization 的规则路径只使用根 `AGENTS.md`，不再把 `rules/` 或 `rules/manifest.yml` 作为当前资产路径。
- `agent-assets-http-contracts`: Agent Assets HTTP catalog 与 inventory 不再包含 Rule add/remove 或 Rule 条目。

## Impact

- 影响 Buildr CLI、HTTP owner 与 Buildr Web typed client；旧 `rules add/remove` 与 `/agent-assets/rules` 调用方会收到退役/不支持响应。
- 影响 workspace 初始化、准备、doctor、组件生命周期、内置资产同步与 package check。
- 影响规则正文、Agent 技能参考与 CLI 参考文档。
- 不影响 `AGENTS.md` 层级发现、Buildr 受管区块、`rules render` / `rules-entry` 或 Skill 生命周期。
- 存量 `rules/manifest.yml`、`rules/*.md` 与含空 `members.rules` 的组件定义继续可读；用户自行迁移后才会移除。
