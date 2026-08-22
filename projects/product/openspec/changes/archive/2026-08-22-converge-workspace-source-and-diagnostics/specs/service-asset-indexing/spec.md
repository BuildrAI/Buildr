## MODIFIED Requirements

### Requirement: service create 支持本地路径和 Git URL
Buildr MUST 使用一个 `service create` 命令将本地内容或Git URL物化为managed Service，或将用户明确选择的既有Git repository登记为Attached Root，并将结果写成canonical Service Domain。

#### Scenario: 接入本地路径
- **WHEN** Agent 调用 `buildr service create <project>/<service> <local-path>` without `--attach`
- **THEN** Buildr MUST 校验本地路径可访问性和 Git 仓库状态，将内容物化到 canonical managed Service path
- **AND** Buildr MUST NOT 在 Domain 中保存 workspace 外部来源路径

#### Scenario: 接入 Git URL
- **WHEN** Agent 调用 `buildr service create <project>/<service> <git-url>`
- **THEN** Buildr MUST clone 或幂等核对该 Git repo，并写入 managed Service source 声明

#### Scenario: 附接既有 Git Service
- **WHEN** Agent调用`buildr service create <project>/<service> --attach <absolute-path>`
- **THEN** Buildr MUST验证实际Git与声明identity并写入attached Service source
- **AND** MUST NOT复制、移动、修改或删除该repository内容

### Requirement: service metadata 作为最小服务资产索引
Buildr MUST 使用已解析Project Root下的`services/manifest.yml`作为Service Domain文件系统投影，并以`buildr.services/v2`作为canonical schema；Project Root location与Service source location MUST分别解析。

#### Scenario: Service entity 字段完整
- **WHEN** Buildr 写入 canonical Service entry
- **THEN** entry MUST 包含 UUID `id`、`workspaceId`、`projectId`、`code`、`name`、`description`、`type` 与 `source`
- **AND** manifest map key MUST 等于 `code`

#### Scenario: 文件系统定位
- **WHEN** Service source没有声明`root`或声明`root: managed`
- **THEN** `source.path` MUST 等于 `projects/<projectCode>/services/<serviceCode>` for a managed Workspace Project，或等于该Project Root内`services/<serviceCode>`的规范化绝对解析结果
- **AND** Application MUST通过source resolver定位实际资产

#### Scenario: Attached Root文件系统定位
- **WHEN** Service source声明`root: attached`
- **THEN** `source.path` MUST是用户明确选择的规范化绝对路径
- **AND** source MUST是具有完整Git declaration的独立Git repository

#### Scenario: Git 来源
- **WHEN** Service source 类型是 Git
- **THEN** source MUST 记录 `url`、`remote` 和 `integrationBranch`
- **AND** current branch、HEAD、dirty、upstream、ahead 与 behind MUST NOT 写入 Domain

#### Scenario: 父实体关联
- **WHEN** repository 读取 Project 下的 Service registry
- **THEN** 每个 Service 的 `workspaceId` 与 `projectId` MUST 分别匹配当前 Workspace 与 Project
- **AND** 顶层 `projectId` MUST 匹配当前 Project

#### Scenario: 空服务集合
- **WHEN** Project 没有 Service
- **THEN** Buildr MUST 保留 canonical 空 Service registry
- **AND** 只有managed Project create MAY创建默认Service collection directory

#### Scenario: 封闭 schema 与规则边界
- **WHEN** Buildr 写入 Service metadata
- **THEN** repository MUST 移除未知字段
- **AND** Service Rules MUST 继续从已解析Service Root的`AGENTS.md`发现，不得写入registry

### Requirement: Git boundary maintenance for managed repos
Buildr MUST 只在最近parent Git repository确实包含managed nested Git Project/Service时维护ignore boundary，并 MUST不修改Attached Root或其外部parent的ignore配置。

#### Scenario: 独立 Project repo
- **WHEN** managed `<root>/projects/<project>/` is a Git repo and `<root>/` is the nearest parent Git repo
- **THEN** Buildr create, update or sync MUST ensure root `.gitignore` ignores `/projects/<project>/`

#### Scenario: 独立 Service repo under Git Project
- **WHEN** managed `<project-root>/services/<service>/` is a Git repo and `<project-root>/` is the nearest parent Git repo
- **THEN** Buildr create, update or sync MUST ensure Project `.gitignore` ignores `/services/<service>/`

#### Scenario: 独立 Service repo under non-Git Project
- **WHEN** managed Service Git repo的最近parent Git repository是Workspace root
- **THEN** Buildr create, update or sync MUST确保该parent忽略实际nested relative path

#### Scenario: Attached Root
- **WHEN** Project或Service source声明`root: attached`
- **THEN** Buildr MUST不写Workspace或外部parent `.gitignore`
- **AND** Doctor MUST按真实repository topology报告identity与ownership冲突

#### Scenario: Git boundary drift
- **WHEN** the nearest owning parent Git repo does not ignore a managed nested Git Project or Service repo
- **THEN** Buildr doctor MUST report a warning scoped to that repository action
