# Agent Runtime Adapters

本文是 Buildr 已接入 Agent runtime adapter 的权威说明。机器可读事实始终以 `buildr runtime list --json` 为准；本文解释每个 adapter 如何把标准 `AGENTS.md` 与 Skills 源资产接入目标 Agent。

新增 adapter 的调查与实现流程见 [Agent Runtime Adapter 接入指南](agent-runtime-adapter-contribution.md)，可交给目标 Agent 的采集问题见 [调研 Prompt](agent-runtime-adapter-research-prompt.md)。

## 使用方式

```bash
buildr runtime list --json
buildr init --agent <agent> --target <workspace>
# 已初始化 workspace
buildr sync <agent> --target <workspace>
buildr doctor --agent <agent> --target <workspace> --json
```

adapter id 不做 alias 或 fallback。目标 Agent 不在列表中时必须停止自动投射并反馈，而不是借用“兼容”的 adapter。

Task Environment 会把 adapter、runtime source root 与 projection identity 写入 Environment Receipt，并通过真实 `runtime check` probe 形成 ready 的一部分。projection ready 只证明任务验证工作区中的文件系统投射；它不证明真实 Agent session 已加载候选内容。真实 session 采用证据只在 runtime 发现、加载或激活机制发生变化且专项验证需要时，由 P0.4 Task Verification 处理，不进入 P0.2 ready 门禁。

## 支持矩阵

| Adapter id | Surface | Rules 接入 | Skills 接入 | 生效/刷新 | 兼容证据 |
|---|---|---|---|---|---|
| `claude-code` | CLI | 每个 source 同目录 `CLAUDE.md` bridge | `.claude/skills` | 新会话 | 既有 contract/parity |
| `codex` | CLI | 原生递归 `AGENTS.md` | `.agents/skills` | path read / 新会话 | 既有 contract/parity |
| `cursor` | IDE、CLI | 各 source scope 的 `.cursor/rules/buildr.mdc` | `.agents/skills` | Rules path read；Skills 新会话 | 官方文档与版本漂移调查 |
| `qoder` | IDE | `.qoder/rules/buildr/*.md` | `.qoder/skills` | Rules path read；Skills `/skills reload` 或新会话 | 官方文档与本机 intake |
| `trae` | IDE | 各 source scope 的 `.trae/rules/buildr.md` | `.agents/skills` | 新会话 | 安装包源码与本机 intake |
| `trae-work` | desktop | root `CLAUDE.local.md` reference bridge | `.trae/skills` | Rules 新会话；Skills immediate | 官方文档与本机 intake |
| `workbuddy` | desktop、desktop-bundled CLI | root `CODEBUDDY.md` reference bridge | `.codebuddy/skills` | 新任务 | 安装包源码与随包文档 |

兼容证据说明 adapter 路径和机制的来源，自动 contract/parity 证明 Buildr 能按契约生成、检查和安全维护投射；它们都不表示目标 Agent 已在当前 workspace、当前版本或当前会话中真实加载文件。

所有表中 Skills root 同时具有 workspace 与 user 两个 destination：前者相对 `--target` 工作目录，后者相对当前用户目录。adapter 还声明可观测 discovery roots、`complete|partial` inventory evidence、未知 admin/system/plugin 边界和 activation；当前 adapters 的内部来源均只能部分观察，因此成功 render 只证明可观测范围内没有冲突。该 `partial` 事实保留在 runtime scope 的 `skillInventoryEvidence` 中，不作为健康 warning 或 repair action。Buildr 只以自身计划投射或 receipt 已管理的 Skill identity 为候选检查可观测同名项，不盘点无关 runtime Skills；它使用 `buildr.skill-projection/v2` receipt 记录 destination、asset/source identity、source workspace、source/render digest 和文件 inventory。外部等价、其他 owner 或同名异内容均不由 `--replace` 接管。

Skill 校验分为两层：可移植核心和 Codex 发布都只要求有效 `SKILL.md`，其 `name` 与 `description` 承担发现和路由；随附目录均为可选。Codex/OpenAI profile 将 `agents/openai.yaml` 视为可选 UI extension：文件存在时校验 `display_name`、`short_description`、`default_prompt` 等结构，缺失时不阻塞发布、发现或 render，也不由 Buildr 机械生成或反写。其他 adapter 会随完整目录保留已有文件，但不解释它。Skill 的模板、脚本等执行资源始终相对于当前 runtime `SKILL.md` 所在目录解析，核心行为不能依赖 vendor metadata。

Buildr 当前不定义或维护真实 Agent marker smoke、品牌通过状态或 GUI automation。未来如重新引入，必须独立设计版本、surface、证据失效、执行 owner 与当前机器配置模型。

## Claude Code (`claude-code`)

- Buildr 在每个 `AGENTS.md` 同目录生成受管 `CLAUDE.md` reference bridge，并将 Skills/install plans 投射到 `.claude/`。
- Rules 与 Skills 在新会话加载；checker 比较 bridge、Skills 和 install plans 的 missing/stale/conflict/orphan 状态。
- 证据状态为既有 adapter contract/parity 与产品验证基线。

## Codex (`codex`)

- Codex 原生递归读取 `AGENTS.md`，Buildr 不生成 Rules 文件；Skills/install plans 使用 `.agents/`。
- Rules 在访问路径时生效，Skills 以新会话发现为准；checker 同时检查 native Rules source 和 Skills projection。
- 候选 Rule、Skill、CLI 与 runtime 可以在 Receipt 绑定的任务验证工作区投射和测试；只有候选集成到 retained source 后，正式 runtime 才能通过 retained `sync/render` 生效。普通内容修改不要求 P0.2 证明当前 Codex session 已重发现 Skills。
- Codex Skills extension profile 只校验 package Skill 已提供的 `agents/openai.yaml`；没有该文件时继续从 `SKILL.md` 发现 Skill，不生成 fallback 文件。
- 证据状态为既有 adapter contract/parity、当前 Buildr 自举运行时与产品验证基线。

## Cursor (`cursor`)

- Buildr 将每个 `AGENTS.md` 转换为同 scope 的 `.cursor/rules/buildr.mdc`；Cursor 官方的 nested project rules 机制负责将子目录 rule 限定到该目录树，避免依赖发生过版本漂移的 native nested `AGENTS.md` 或 glob 匹配。
- Buildr Skill、workspace Skills 和 install plans 使用所选 destination 的 `.agents/`；Project 不产生独立 Skill source 或 runtime scope。
- checker 对 IDE/CLI 安装与版本采用人工确认，因为安装形态并不稳定。
- 当前不直接依赖 Cursor 原生 nested `AGENTS.md`：公开版本行为曾发生漂移，scoped `.mdc` 才能保持 Buildr 的 sibling isolation。Rules 或 Skills 未刷新时开启新 chat。
- 兼容证据来自 [Cursor Rules](https://cursor.com/docs/context/rules)、[Cursor Skills](https://cursor.com/docs/context/skills) 与版本漂移调查。

## Qoder (`qoder`)

- Buildr 把每个 `AGENTS.md` 转换为 `.qoder/rules/buildr/<source-id>.md`。root 使用 `trigger: always_on`，nested 使用 `trigger: glob` 与 `<scope>/**`。
- Skills 与 install plans 使用 `.qoder/`；同名 Skill 的官方优先级为 project 高于 user。
- Qoder 官方限制 active Rules 总量最多 100,000 字符；Buildr 在写入前检查每个目标和总量。
- checker 使用静态无 shell 的 `qoder --version`；Skills 修改后运行 `/skills reload`，不可用时开启新会话。
- 兼容证据来自 [Qoder Rules](https://docs.qoder.com/user-guide/rules)、[Qoder Skills](https://docs.qoder.com/en/cli/Skills) 与本机 intake。

## TRAE (`trae`)

- Buildr 在每个 discovered source scope 生成带 `alwaysApply: true` frontmatter 的 `.trae/rules/buildr.md`；这样 root、Project、Service/deeper Rules 保持各自目录边界。
- Skills 与 install plans 使用 `.agents/`。TRAE 3.5.73 的 `AI.skills.enableAgentsDir` 默认开启，安装包说明会自动加载当前工作目录的 `.agents/skills`；这也与本机会话中 workspace destination Skills 的实际注入一致。`.trae/skills` 在该版本安装包中只证明为 vendor 内容/编辑器路径，不能替代已观察到的工作目录发现入口。
- checker 使用静态无 shell 的 `trae --version` 确认入口存在；该命令当前返回底层编辑器 build，因此产品版本必须从 About 人工记录。Rules 或 Skills 修改后开启新会话。
- 兼容证据包括 [TRAE 官方 Skills 指南](https://www.trae.ai/blog/trae_tutorial_0115?v=1)、本机 intake、安装包 `AI.skills.enableAgentsDir` 配置，以及 `agent-tool-host` 中的 `globs`、`alwaysApply`、`description` 和 Rules import flags。

## TRAE Work (`trae-work`)

- TRAE Work 与 TRAE IDE 是两个独立 adapter：TRAE IDE 的 workspace destination Skills 使用 `.agents/skills`，TRAE Work 使用 `.trae/skills`；两者的 Rules、Skills root、surface 和 activation 都必须分别认证。
- Buildr 生成 root `CLAUDE.local.md`。bridge 明确要求 Agent 读取 root 和当前工作路径 ancestor chain 中适用的 `AGENTS.md`，并列出 source index；普通 Markdown 链接本身不视为 include。
- 使用前必须在桌面 Settings 中启用对应 Rules import；修改 Rules 后开启新会话。Skills 写入后的实际即时发现仍以产品版本为准。
- checker 读取 `/Applications/TRAE SOLO.app` 版本，并报告 projection 与 activation guidance；不会把缺少真实 Agent 验证当作当前 workspace prerequisite。
- 兼容证据来自 [TRAE Work Rules](https://docs.trae.cn/work_rules)、[TRAE Work Skills](https://docs.trae.cn/work_skills) 与本机机制 intake。

## WorkBuddy (`workbuddy`)

- Buildr 生成 root `CODEBUDDY.md`，其中包含 imperative ancestor-chain 读取指令和 source index；内容不得超过 WorkBuddy 5.2.5 已观察到的 8,000 字符 project guidance 上限。
- WorkBuddy 5.2.5 安装源码的 first-match 顺序是 `CODEBUDDY.md`、`.codebuddy/CODEBUDDY.md`、`AGENTS.md`，只读取 workspace root 第一个存在的入口。非 Buildr 管理的 `CODEBUDDY.md` 会触发 conflict，Buildr 不覆盖也不静默降级。
- Skills 与 install plans 使用 `.codebuddy/`。WorkBuddy 5.2.5 内置的 CodeBuddy CLI 2.106.4 文档和 Skills panel 源码都将当前工作目录的 workspace destination Skills root 声明为 `.codebuddy/skills/`；`.workbuddy/skills` 只出现在 sandbox 可写路径中，不能据此认定为发现入口。Rules 与 Skills 修改后都要开启新任务。
- checker 读取 `/Applications/WorkBuddy.app` 的 bundle id/版本，并检查 bridge、Skills 和 install plans 的 projection 状态。
- 兼容证据来自本机 app.asar 源码、随应用交付的 CodeBuddy CLI 文档/源码和运行时 intake；官方公开文档只覆盖产品与 Marketplace，未公开 project guidance 与工作目录 Skills discovery 的完整实现。

## Checker 与限制

`runtime check`/doctor 分别报告 projection、安装/版本 probe、runtime source/projection identity 和 activation/reload guidance。它们能证明 Buildr 计划是否完整、目标是否 missing/stale/conflict/orphan，但不能从文件系统单独证明 GUI Agent 已加载内容。需要真实 session 证据时交给 Task Verification；缺少这类证据本身不阻塞普通 Environment ready。

- 所有 runtime 目标都受统一路径保护、symlink 防护、零写入冲突预检、managed ownership、orphan cleanup 和幂等 reconcile 约束。
