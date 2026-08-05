## ADDED Requirements

### Requirement: Package 必须统一排除 Task 本机目录
Buildr package、Workspace 初始化与 Workspace sync MUST 统一维护根 `.gitignore` 中的 `/.buildr/tasks/`，使 Task Environment Receipt 与 inert legacy records 保持 Workspace-local。维护 MUST 采用保留用户内容的幂等追加语义，不得借此修改 Git index 或删除旧记录。

#### Scenario: 初始化新 Workspace
- **WHEN** 用户使用 current package 初始化新的 Workspace
- **THEN** 默认 package baseline 与初始化结果的根 `.gitignore` MUST 包含且只追加一次 `/.buildr/tasks/`
- **AND** MUST NOT 依赖某个 Task 已经存在才补齐规则

#### Scenario: 同步已有 Workspace
- **WHEN** 已有 Workspace 运行 `buildr sync <agent>` 且尚无 broad Task ignore entry
- **THEN** Buildr MUST 向根 `.gitignore` 追加 `/.buildr/tasks/`
- **AND** MUST 保留已有精确 `environment.json` 规则、用户规则、注释和其他 bytes

#### Scenario: 重复同步
- **WHEN** 已有 Workspace 已包含 `/.buildr/tasks/` 并再次运行 sync
- **THEN** Buildr MUST NOT 生成重复条目或无关 `.gitignore` 改写

#### Scenario: 旧 Task YAML 已被 Git 跟踪
- **WHEN** Workspace Git index 已跟踪 `.buildr/tasks/` 下的历史文件
- **THEN** init 或 sync MUST NOT 自动执行 `git rm --cached`、删除或改写这些文件
- **AND** broad ignore entry MUST 只影响 Git 对未跟踪路径的发现
