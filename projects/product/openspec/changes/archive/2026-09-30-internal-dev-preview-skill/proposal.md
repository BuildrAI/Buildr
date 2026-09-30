# internal-dev-preview-skill

## Why

Buildr 自举工作空间验收前端与任务详情改动时，维护者需要"用开发工作树的代码 + 指定任务数据"起一个真实的 Buildr Web 页面。这条路径此前依赖口头流传的配方（构建前端产物、隔离 `BUILDR_APP_DATA_DIR`、复制 canonical SQLite、以工作树开发入口起服务），没有写入任何技能（Skill），agent 每次都靠重推导；把它做成内置 Skill 又会把 Buildr 自身开发才需要的流程分发到用户 workspace。

## What Changes

- 在 workspace 源资产 `skills/` 中新增内部技能 `buildr-dev-preview`：为 Buildr 自举工作空间的开发/验收起 Buildr Web 预览，数据源支持 canonical workspace 实时任务库、隔离 SQLite 快照与空现场三种模式。
- 技能登记进本 workspace `skills/manifest.yml`，与 `buildr-release`、`buildr-self-bootstrap-sync` 同为 workspace-local 资产；**不进入** `projects/product/services/buildr/resources/` 随包资产、不进入内置 Skill 清单、不写用户级安装说明。
- 技能正文明确：优先使用 `buildr web preview start/list/stop` 托管生命周期；托管 `--task` 路径存在已知缺陷时如实降级为手工配方并说明身份证据差异；不得改写 canonical 任务库、不得动默认 Buildr Web / Buildr Web Dev.app、不得用主目录旧文件冒充工作树材料。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `agent-task-workflows`：新增"自举工作空间内部预览技能"要求，约束 `buildr-dev-preview` 的存在性、用途边界、数据源模式与托管路径优先级。

## Impact

- 新增 `skills/buildr-dev-preview/SKILL.md` 与 `skills/manifest.yml` 登记（自举工作空间源资产）。
- 不改产品代码、不改用户 workspace 默认能力；对 `worktree-buildr-web-preview` 的托管契约无影响（其材料可读性修复由 `task-worktree-material-readability` 承担）。
- 文档与技能正文使用中文；schema 字段、协议名与命令保留英文。
