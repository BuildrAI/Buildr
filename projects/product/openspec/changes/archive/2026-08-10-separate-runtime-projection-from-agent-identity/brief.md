# 分离 runtime 投射与 Agent 身份

## 摘要

产品入口 Buildr Skill 改为 adapter-neutral，避免任何能读取投射文件的 Agent 把投射目标误认为自身身份。

## 背景与问题

当前 renderer 会向 Buildr Skill 追加“当前 Agent Adapter”和固定维护命令。Qoder 读取 Codex 的 `.agents/skills` 投射后，会以 `codex` 执行“更新 workspace”，实际更新和验证错误 runtime。

## 目标与非目标

- 当前宿主身份只来自宿主明确上下文；用户可显式指定其他维护目标。
- Skill 路径、generated marker、receipt 和 Doctor 投射字段不提供身份 authority。
- 不改变 CLI 参数，不增加 Workspace 默认 Agent，也不让 CLI探测调用宿主。

## 核心变化

- 删除 adapter-specific Skill 正文注入，保留精简的 `<agent>` 选择边界。
- adapter-specific 命令和投射事实继续由 registry、Doctor 与 receipt 提供。
- package contract 与跨 adapter 测试阻止身份声明回归。

## 影响、风险与兼容性

现有显式 `sync <agent>` 和 `--agent` 兼容。旧会话可能缓存错误正文，投射更新后仍需按宿主要求 reload 或开启新会话。

## 验收摘要

- 所有 supported adapter 的产品入口 Skill 不包含当前 Agent 声明或固定 adapter 命令。
- Qoder 即使读取 Codex 投射，普通“更新 workspace”也只能使用宿主 `qoder`。
- 用户明确要求维护 Codex runtime 时，Qoder 仍可显式使用 `codex`。

## 技术入口

- `design.md`
- `specs/product-agent-skills/spec.md`
- `specs/managed-skill-assets/spec.md`
- `specs/buildr-package-assets/spec.md`
- `tasks.md`
