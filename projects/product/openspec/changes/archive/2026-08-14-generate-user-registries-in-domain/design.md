## Context

`package/targets/workspace/` 同时保存两种不同性质的内容：一类是必须随产品交付的 Rule、Skill、Command collection、Component definition 和文档模板；另一类是用户 Workspace 中的持久化配置或 registry。后者目前通过 `workspaceFiles`、`projectFiles` 和 `package.json#files` 进入 npm tarball，其中 `.buildr/workspace.yml` 与 Project `services/manifest.yml` 已被代码显式跳过，证明其模板已失去运行时用途；其他空 manifest 仍由 `init` 或 `project create` 复制。

产品已经具备 Workspace、Project、Service、Rules、Skills、Commands 和 Components 的 canonical parser/writer。`package/manifest.yml` 也已经独立声明 Builtin Rules、Skills、Commands、capability contracts、bindings 和 Components，因此无需再用一个用户态 manifest 文件复制同一事实。

## Goals / Non-Goals

**Goals:**

- npm tarball 和 Application Payload 不包含用户态 Workspace/Project 配置源。
- 新 Workspace、Project 及升级后缺失配置由对应 canonical writer 生成。
- Builtin 内容从 `package/manifest.yml` 与 Component definition 收敛到新生成的 registry，保持 checkout、tarball、init 和 sync 对等。
- 已有有效用户配置保持原字节/语义，只有缺失文件或明确迁移才写入。
- package check 和 release artifact 测试直接阻止禁止路径重新进入发布物。

**Non-Goals:**

- 不改变 Workspace、Project、Service registry 的公开路径或 schema。
- 不移除必须随产品交付的 Rule/Skill 正文、Command collection、Component definition、Agent metadata 或专业模板。
- 不把所有 YAML 都改为代码常量；只有用户持久化配置与 registry 禁止作为发布源。
- 不改变 Builtin 卸载、恢复、ownership receipt 或用户修改保护语义。

## Decisions

### 1. 以“用户持久化配置”而非扩展名划分发布边界

禁止源包括 Workspace metadata、Workspace registry、Project 默认配置和 Service registry：

- `.buildr/workspace.yml`
- `projects/manifest.yml`
- `rules/manifest.yml`
- `skills/manifest.yml`
- `commands/manifest.yml`
- `components/manifest.yml`
- `projects/capabilities.yml`
- `projects/commands.yml`
- `projects/services/manifest.yml`

Command collection `manifest.yml`、Component `component.yml`、Skill `agents/openai.yaml` 和 Skill 专业模板仍是产品定义或内容资产，可以随包发布。相比“禁止全部 YAML”，按所有权分类不会误删产品能力。

### 2. 初始化先生成空 registry，再执行 Builtin/Component 收敛

`init` 使用 canonical writer 建立 Workspace metadata、空 Project/Rules/Skills/Commands/Components registry，并写入真实 Workspace identity；随后复用现有 Builtin 与 Component 同步，把 package 声明转换为用户 Workspace 中的受管条目。这样 `package/manifest.yml` 是产品声明 authority，用户 manifest 只保存该 Workspace 的安装状态。

备选方案是继续发布空模板，但这会让源文件与 writer schema 形成双重 authority，并再次产生当前漂移，因此不采用。

### 3. Project 创建和同步用 writer 补齐 Project 配置

Project baseline 仍可从 `projectFiles` 安装 `AGENTS.md` 等内容模板；`capabilities.yml`、`commands.yml` 和 `services/manifest.yml` 改由代码生成。Service registry 必须使用真实 Project UUID。同步只在文件缺失时生成空配置；已有配置继续经过现有迁移/收敛路径，不以空内容覆盖。

### 4. 发布验证同时检查源树和最终 tarball

静态 package validation 拒绝禁止路径出现在 `workspaceFiles`、`projectFiles` 或 `package/targets/workspace/`。release artifact 测试还必须枚举最终 npm tarball，证明禁止路径不存在；初始化/同步测试则证明安装后目标 Workspace 中相应文件存在且 canonical。

只检查 source mapping 无法覆盖 `package.json#files` 的宽目录打包，只检查 tarball 又会延迟反馈，因此两层都保留。

## Risks / Trade-offs

- [初始化顺序改变导致 Builtin writer 读取缺失 registry] → 在调用现有 Builtin/Component 收敛前，用各 domain renderer 原子生成空 registry，并覆盖 init/package smoke。
- [误删产品 YAML 定义] → 使用精确禁止路径集合，不按文件扩展名或 basename 全局过滤。
- [sync 覆盖用户配置] → writer 只补缺失文件；现有文件继续走当前 parse、migration 和 ownership 保护。
- [checkout 与 tarball 行为漂移] → 对两种入口运行同一初始化/Project 创建测试，并直接断言 tarball inventory。

## Migration Plan

1. 为用户态配置源建立集中禁止路径常量和 static validation。
2. 让 init/Project repair 通过 canonical writer 生成缺失配置。
3. 从 package manifest 和 `package/targets/workspace/` 删除对应物理源及无用模板变量/分支。
4. 验证新 Workspace、已有 Workspace 缺失配置、Project 创建和发布 tarball。
5. 现有 Workspace 无需批量迁移；后续显式 sync/update 只补齐缺失配置。

回滚时可恢复旧版本代码和模板，但已经由 writer 生成的用户配置仍符合原 schema，无需数据回滚。

## Open Questions

无。
