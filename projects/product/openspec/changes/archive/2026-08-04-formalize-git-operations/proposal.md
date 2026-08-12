## Why

Buildr 当前用 `git-ops` 同时提供三项重叠 capability，旧 contract 还把任务集成、workspace update 和单项操作分成互相冲突的入口，无法表达 P0.6 所要求的“consumer 已选定动作，Git Operations 只提供安全边界与最小 evidence”。P0.5 已稳定 Development/Finish authority，现在需要在 P0.7 之前先把 Git 行为收敛为一个宽而薄的 Skill-only 入口。

## What Changes

- 交付唯一 `git-operations` Skill 和薄 `buildr.git-operations/v1` capability contract，只处理明确 repository、operation、ref 与授权下的一次 Git Operation。
- 固化精确暂存、commit 与 push 分离、操作前后 identity、完整 push commit range、共享 commit 冻结、最小 Result 和部分失败 fail-closed 语义。
- 保留 Agent 的意图理解、冲突语义判断和用户决策交接；operation、目标与顺序继续由直接用户或 Task Finish 等 consumer 决定。
- **BREAKING**：删除 `git-ops` 入口以及 `buildr.git-single-operation/v1`、`buildr.git-task-integration/v1`、`buildr.git-workspace-update/v1` contract、binding、router、schema 与双轨测试；迁移 Task Finish optional dependency 和 Buildr 产品入口。
- 保留 `buildr.git-worktree-provider/v1` 作为 Task Environment 的窄 checkout provider，不并入 Git Operations。
- 不新增 Application、CLI、Receipt、数据库、状态机、锁、CAS、scheduler 或通用 Git transaction，也不扩展 P0.7 Metadata Publication 或 P0.8 Task Finish。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: 用一个 Git Operations 行为边界替换旧 Git Ops 集成策略和 Task Finish 单项 dependency。
- `product-agent-skills`: 把产品入口与提交信息 guidance 路由到唯一 `git-operations` Skill/capability。
- `buildr-package-assets`: 切换 package capability graph、provider replacement 与静态验证到唯一新入口，并删除旧双轨。
- `openspec-upgrade-integration`: 移除“必须保留 `git-task-integration`”的过期兼容要求，继续保护真正独立的 contracts。

## Impact

- Product 权威 Skill、contract 与 manifests：`services/buildr/package/targets/workspace/skills/`、workspace/package manifests。
- 真实 consumers：`task-finish` 的 retained metadata-only optional dependency，以及 Buildr Skill 的 Git workspace update / 独立 Git Operation 路由。
- current specs、roadmap、bootstrap guide、CLI reference、capability contract 文档和 package/System tests。
- retained Workspace 的派生 Codex runtime 只在集成后由 Product source 执行 sync 更新。
