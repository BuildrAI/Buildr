## MODIFIED Requirements

### Requirement: Buildr 产品交付必须单向物化
Buildr MUST将当前产品 `resources/workspace` 与 `resources/runtime` 视为产品交付源，并将用户 Workspace 和 Agent runtime 中的对应文件视为安装结果。

#### Scenario: Workspace target 单向物化
- **WHEN** Agent 使用当前 Buildr 产品执行 init 或 sync
- **THEN** Buildr MUST从 `resources/workspace/` 向目标 Workspace 物化 manifest 声明的资产
- **AND** Buildr MUST NOT从目标 Workspace 反向更新 Product Project 的资源源

#### Scenario: Runtime target 单向物化
- **WHEN** Agent 执行 `buildr skill install <agent>`、`buildr sync <agent>` 或 `buildr init --agent <agent>`
- **THEN** Buildr MUST从 `resources/runtime/` 安装 manifest 声明的产品入口 Agent Skill
- **AND** 安装后的 runtime 文件 MUST NOT成为产品 Skill 的源资产

#### Scenario: 未合并候选产品使用隔离目标验证
- **WHEN** Buildr 维护者使用未合并的 task worktree Product checkout 验证候选产品
- **THEN** init/sync MUST使用该 checkout 随附的 resources
- **AND** CLI update 测试 MUST使用隔离 Git checkout 或 npm prefix
- **AND** 验证目标 MUST是临时 Workspace 或 task worktree自身，而不是主开发工作区的自举 Workspace

#### Scenario: 相同候选 tree 集成后不重复物化验证
- **WHEN** 已完成隔离验证的候选 Git tree 未经内容改变集成到主开发分支
- **THEN** Buildr 开发流程 MUST NOT要求仅为重复产品验证而从主开发分支 checkout 再次 sync 主自举 Workspace
- **AND** 实际 Workspace 后续需要消费新版产品资产时 MAY独立执行 sync

#### Scenario: 保留 workspace 自有内容
- **WHEN** init/sync 向 Workspace 物化产品管理资产
- **THEN** Buildr MUST继续保留用户或自举 Workspace 自有的 `AGENTS.md` 正文和未由资源 manifest 管理的资产
- **AND** Buildr MUST只修复 required block 和 manifest 声明的产品管理资产
