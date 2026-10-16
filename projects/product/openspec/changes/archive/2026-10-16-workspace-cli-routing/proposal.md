## Why

工作空间（Workspace）的网页管理归属已在开发版与发布版之间隔离，但默认 `buildr` 仍固定执行 npm 安装，导致集鲜登记在 Buildr Web Dev 后，终端仍使用旧发布版。现在需要让同一工作对象的命令入口与现有管理归属一致，减少用户和智能体（Agent）手工选择版本及误用旧命令的机会。

## What Changes

- 默认 npm `buildr` 在加载本包业务运行时（Runtime）、检查本包 Node 范围及注入安装环境前，按目标工作空间（Workspace）的现有登记选择执行来源；先识别 `--target`，否则从当前目录定位。
- 只读核对 `.buildr/local/web-management.json`、开发版与发布版的目录登记；覆盖子目录、符号链接（Symbolic Link）与独立工作树（Worktree），不把相同标识的独立副本当作已登记对象。
- 开发版从已校验的 Buildr Web Dev 启动器（Launcher）登记发现源码根及 Node；发布版继续使用已验证 npm 安装。选版不要求网页正在运行，不新增工作空间版本配置，不打开或迁移 SQLite。
- 未知新命令在旧版命令解析前原样委派；保留参数、当前目录、标准输入输出、退出状态及信号，清理来源安装的专用环境，避免串用安装身份和递归委派。
- 显式 `projects/product/buildr`、图形启动器（Launcher）及安装自身管理命令保持绑定来源；无 `--target` 的 `web` 保持既有目录列表行为，带 `--target` 的 `web` 按归属选择。
- 登记损坏、矛盾、所选来源不可用时明确失败，不能悄悄换版；未登记对象保持当前 npm 行为。

不改变已有业务命令的目标参数语义，不迁移集鲜归属，不发布新 npm 版本。已有合法调用保持兼容；已登记但无法证明所选来源的调用将改为明确失败，这是为避免错误版本执行而收紧的行为边界。

## Capabilities

### New Capabilities

- `workspace-cli-routing`：默认命令入口按现有工作空间（Workspace）管理归属选择并委派到对应 Buildr 来源。

### Modified Capabilities

- `npm-cli-package`：区分 npm 默认入口所有权、前置选版与所选来源的资产/运行时（Runtime）责任，保留显式开发入口和图形启动器（Launcher）的安装绑定。

## Impact

- `services/buildr` 的命令入口、安装来源发现、工作空间（Workspace）登记读取、应用负载（Application Payload）构建与随包依赖闭包。
- 随包 Buildr 技能（Skill）及命令参考：说明普通用户目录继续使用默认 `buildr`，显式开发入口保持既有开发用途。
- 直接测试及独立安装包验证：覆盖双版选择、未知命令、隔离环境、失败边界、发布版独立可运行；以集鲜当前真实登记做只读验收。
- 已有知识的预计影响限于 `knowledge/code-map/system-services-assets.md`、`knowledge/docs/architecture/buildr-data-design.md` 及相关入口解释；本次仅评估和报告建议，未获得额外知识建设授权时不改写。
