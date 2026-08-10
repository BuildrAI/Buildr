## Why

Buildr 当前把 Skill 的投射 adapter 注入为“当前 Agent Adapter”，并生成该 adapter 的固定命令。能读取同一 Skill discovery root 的其他 Agent 会据此误认身份，例如 Qoder 读取 Codex 投射后用 `codex` 执行“更新 workspace”，导致维护和验证了错误 runtime。

## What Changes

- 产品入口 Buildr Skill 改为 adapter-neutral，不再把投射目标写成当前宿主身份，也不注入固定 adapter 命令。
- 明确 `<agent>` 的 authority：普通当前环境操作使用宿主明确提供的 Agent 身份；用户明确指定其他 runtime 时才使用该目标；身份无法确认时停止。
- 明确禁止从 Skill 路径、generated marker、投射回执或 Doctor 的 `requested`、`selected`、`detectedAgents` 推断当前宿主。
- 保留 adapter-specific 路径、命令和投射证据于 runtime registry、Doctor 与 receipt，不建立 Workspace 级默认 Agent。
- 精简 Buildr Skill 正文和 bootstrap 契约，并增加跨 adapter 投射回归测试。

不包含破坏性 CLI 变更；现有显式 `--agent` 和 `sync <agent>` 语义保持不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-agent-skills`：产品入口 Skill 必须从宿主或用户明确目标选择 adapter，不得从投射产物推断身份。
- `managed-skill-assets`：runtime Skill 的 adapter context 不得声明读取者身份或提供隐式默认 adapter。
- `buildr-package-assets`：bootstrap 契约必须校验 adapter-neutral 身份边界，并禁止生成身份冒充内容。

## Impact

- `projects/product/services/buildr/package/targets/runtime/skills/buildr/SKILL.md`
- runtime Skill renderer、bootstrap package contract 与 package smoke checks
- Product current-state knowledge、OpenSpec specs 和 runtime projection tests
- 所有 supported adapter 的产品入口 Buildr Skill 投射内容
