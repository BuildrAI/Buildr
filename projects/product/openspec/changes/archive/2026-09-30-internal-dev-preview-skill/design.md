# internal-dev-preview-skill 设计

## 目标

给 Buildr 自举 workspace 一个可发现、可复用的内部预览技能：agent 接到"用开发工作树的代码 + 指定任务数据起预览页面"时，不需要重新推导配方，也不会把这套仅服务 Buildr 自身开发的流程扩散到用户 workspace。

## 关键决策

### 1. 技能载体：workspace-local 源资产，不是产品内置

- 位置：`skills/buildr-dev-preview/SKILL.md`，登记进 `skills/manifest.yml`（`assetIdentity`/`sourceIdentity` 使用 `workspace:<workspace-id>` 前缀），与 `buildr-release`、`buildr-self-bootstrap-sync` 同类。
- 不写入 `projects/product/services/buildr/resources/`：`resources/` 是发布边界，任何进入者都会随包分发并可能成为用户 workspace 的同步内容。本技能只在自举 workspace 有语义（它描述的"开发入口、canonical 任务库、自举 worktree 约定"均绑定本 workspace 的结构）。
- 不新增 capability contract / provider binding：预览动作是一次性流程指引，不是可替换的 provider 动作。manifest 登记沿用 workspace-local 形态（无 `source`/`enabled`/`runtimePath` 字段组）。
- `.agents/skills/` 是投射产物，不手工编辑；技能是否被当前宿主投射由同步/渲染机制决定，技能资产本身是唯一 authority。

### 2. 数据源三模式

| 模式 | 服务目标 (`--target`) | 任务数据来源 | 适用 |
|---|---|---|---|
| canonical 实时库 | canonical workspace 根 | canonical `.buildr/local/workspace.sqlite` 实时读取 | 需要真实任务记录 + 工作树材料的验收（受管证据解析 `task-worktree-candidate`） |
| 隔离快照 | 任务工作树根 | 启动前用一致副本（SQLite backup 语义）为工作树 `.buildr/local/workspace.sqlite` 播种 | 预览 `--task` 形态、需要隔离写入或冻结数据 |
| 空现场 | 全新隔离工作目录 | 不复制任务库 | 只验证 UI 壳层、不依赖任务材料 |

快照播种只允许写入工作树自身 `.buildr/local/`（隔离现场），canonical 库只读；缺失时播种，已存在时不静默覆盖。

### 3. 生命周期优先走托管路径

- 首选 `buildr web preview start <instance> [--task <id>] [--target <root>]`、`list`、`stop`：它们持有实例 owner、secret、健康检查与认证停止。
- 手工配方（`BUILDR_APP_DATA_DIR=<隔离根> <worktree>/projects/product/buildr web --target <root> --port 0`）仅在托管路径不支持当前模式（空现场、缺 `workspace.yml` 的手工根）或存在已知缺陷（`--task` 运行时缺口未修复的旧代码）时使用，并必须向维护者说明实例不受托管 stop/owner 证据保护。

### 4. 身份与边界守卫

- 预览进程只来自被验收工作树的 `projects/product/buildr` 开发入口，绝不使用本机 PATH 上的 `buildr`（那是 npm installation，身份不同）。
- `BUILDR_APP_DATA_DIR` 指向预览专属隔离根；不得指向用户默认数据目录。
- 不写 canonical workspace 内容、不停/改默认 Buildr Web 与 Buildr Web Dev.app、不创建远端引用。
- 读取材料时坚持工作树证据来源：`task-worktree-candidate` provenance 缺失或漂移时如实表达诊断，不拿 canonical 同名旧文件顶替。

## 与相邻变更的关系

`task-worktree-material-readability` 负责产品侧修复（`--task` 运行时缺口与 linked worktree 证据身份），两者独立交付；本技能的托管路径说明按修复后语义书写，手工降级分支保留以覆盖旧构建。

## 不做的

- 不实现新的 CLI 子命令、HTTP 端点或产品功能。
- 不提供用户文档、安装指引或发布说明。
- 不覆盖验收方案（user acceptance）与默认 `buildr web` 实例。
