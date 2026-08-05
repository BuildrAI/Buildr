## Context

当前 command catalog 有三个 `legacy` executable descriptors：`openspec baseline create`、`openspec check` 与 `skills migrate-project-assets`。前两者维护旧 `.buildr/contract-baseline.json`、`.buildr/contract-pre-sync-receipt.json` 与阶段结果；第三个扫描、复制并删除 Project Skill source。当前 OpenSpec apply contribution 一方面禁止创建或刷新旧 baseline，另一方面仍调用强制依赖 baseline 的 proposal check，fresh Change 因而存在必然阻断。Doctor 和 Skills diagnostics 仍把 Project migration 命令作为恢复动作，使已废弃的数据模型继续拥有产品路径。

用户已明确选择破坏性清退：不保留 alias、隐藏兼容入口、自动迁移器或 Legacy 帮助分组。历史 archive bytes 不属于可执行产品表面，保持不改。

## Goals / Non-Goals

**Goals:**

- 删除三个 Legacy CLI 的 descriptor、handler、公开 schema、sidecar writer/reader 与迁移实现。
- 让 OpenSpec 新流程只依赖 upstream strict validation、专业 Planning Review 与最终 `openspec converge` 事务。
- 对 Project Skill source 保持 fail closed，但不再提供自动复制、删除或语义推断。
- 从 package/runtime sources、Doctor/diagnostics、当前文档和测试中删除所有可执行迁移建议。
- 删除 command catalog 的 `legacy` surface 与根帮助分组，并以 unknown-command 零写入测试保护退役结果。

**Non-Goals:**

- 不删除历史 archived Change 中的 baseline/receipt bytes或历史文字。
- 不扩大为所有 deprecated 参数清理；`service create --rules` 等不属于当前三个 Legacy CLI 的兼容输入保持原契约。
- 不为 Project Skill source 增加新的迁移命令、自动修复器、adapter framework 或第二 writer。
- 不削弱 `openspec converge` 的冲突检测、隔离验证、条件式应用、写后确认与恢复保证。

## Decisions

### 1. 删除旧能力，而不是只隐藏命令

同时删除 route、Application handler、公开 JSON schema、legacy registry、sidecar helper 的仅旧消费者、迁移 planner/apply 以及测试。仅从帮助隐藏会留下可调用第二路径，违背“都不留”的明确决定。

### 2. OpenSpec proposal 不新增替代 Buildr CLI

apply 前继续运行 `openspec validate <change> --strict`，Planning Review 负责计划语义审查；最终 deterministic facts 由 `openspec converge` 在写入前重新计算并 fail closed。`validateOpenSpecProposalAlignment` 若没有 current consumer 一并删除，不新增 `preflight`/`check-v2`，避免用新名字重建旧阶段工作流。

### 3. Project Skill source 只拒绝，不迁移

workspace 是唯一 Skill source authority。Doctor 可以报告旧 Project Skill source 不受支持，但 next action 只能要求升级前人工整理或使用旧版 Buildr 完成迁移；当前 CLI 不读取其语义、复制内容或删除目录。Skills add/render 的 Project scope diagnostic 同样不再指向当前迁移命令。

### 4. 历史数据保持 inert

archive 中旧 sidecar 与文字是历史证据，不批量重写或删除。当前代码不得读取它们作为授权；`converge/audit` 只消费自身 convergence receipt。

### 5. 删除 Legacy surface enum

command descriptor 的合法 surface 收敛为 `primary|agent-machine|maintenance`。验证动态检查三类分区，三个已删除命令分别验证 dispatch、help、candidate 与 JSON schema 不可达。

## Risks / Trade-offs

- [旧自动化立即失败] → changelog 明确 BREAKING，unknown-command 返回 canonical help；不提供 alias。
- [尚未迁移的旧 workspace 无自动升级路径] → Doctor fail closed 并明确“当前版本不执行迁移”；用户需在升级前使用旧版本或人工审阅整理。
- [过早删除 proposal alignment] → upstream strict validation、Planning Review 与 converge 写前冲突/漂移门禁共同覆盖当前生命周期；用集成测试证明 fresh Change 不再依赖旧 baseline。
- [误删历史证据] → 删除范围只含 current source/runtime/documentation consumers，不修改 archive 中历史 sidecar。
- [与 retained workspace 并行改动冲突] → 在 Task worktree 实现，最终由 Task Finish Delivery Carrier 对最新 `dev` 做机械应用或显式适配。
