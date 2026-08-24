## MODIFIED Requirements

### Requirement: root project registry
Buildr MUST 维护 root `projects/manifest.yml` registry，将 Workspace 发现与治理的 Projects 投影为存储无关 Project Domain；Project 可以位于默认 Managed Root 或用户明确登记的 Attached Root。

#### Scenario: 初始化空 registry
- **WHEN** Agent executes `buildr init --target <root>`
- **THEN** Buildr MUST create `<root>/projects/manifest.yml` with `schemaVersion: buildr.projects/v2` and an empty Project registry
- **AND** Buildr MUST create `<root>/projects/` even when no Project exists

#### Scenario: registry 记录完整 Project entity
- **WHEN** Buildr records Project `<project>` in canonical `projects/manifest.yml`
- **THEN** the Project MUST contain UUID `id`, UUID `workspaceId`, `code`, `name`, `description` and `source`
- **AND** `workspaceId` MUST equal the current Workspace identity
- **AND** the manifest map key MUST equal `code` but MUST NOT replace the domain field

#### Scenario: registry 记录 materialized path
- **WHEN** Project source 没有声明 `root` 或声明 `root: managed`
- **THEN** `source.path` MUST locate the Project as `projects/<code>` relative to the Workspace
- **AND** Buildr MUST NOT use an absolute or escaping managed path

#### Scenario: registry 记录 Attached Root
- **WHEN** Project source 声明 `root: attached`
- **THEN** `source.path` MUST 是用户明确选择的规范化绝对路径
- **AND** source MUST 为具有完整Git declaration的独立Git repository
- **AND** Buildr MUST NOT推导其内容ownership

#### Scenario: registry 使用封闭 schema
- **WHEN** Buildr writes Project metadata in `projects/manifest.yml`
- **THEN** the registry MUST limit Project data to the canonical Domain fields
- **AND** Project rules, memory, business facts, OpenSpec, Skills, capabilities, Commands, verification and service metadata MUST remain outside the Project entity
- **AND** Buildr update or sync MUST remove unknown Project registry fields only after a complete successful preflight

### Requirement: project create maintains registry
Buildr 在创建、修复或附接 Project asset root 时 MUST 通过 Project Application 更新 canonical Project Domain，并 MUST区分managed materialization与attached registration effects。

#### Scenario: 创建 workspace-managed Project
- **WHEN** Agent executes `buildr project create <code> --target <root>` without a repo URL or attachment
- **THEN** Buildr MUST create or repair `<root>/projects/<code>/` using the Project baseline
- **AND** Buildr MUST record a new UUID identity, current Workspace UUID, `code`, `name`, `description` and `source.type: workspace`
- **AND** `source.path` MUST be `projects/<code>` and source MUST project `root: managed`

#### Scenario: 创建 Git-managed Project
- **WHEN** Agent executes `buildr project create <code> --repo <git-url> --integration-branch <branch> --target <root>`
- **THEN** Buildr MUST materialize the Project asset repo at `<root>/projects/<code>/`
- **AND** Buildr MUST record `source.type: git`, managed path, URL, declared remote and declared integration branch
- **AND** if integration branch is omitted, Buildr MUST resolve and persist the remote default branch or fail without partial registry writes

#### Scenario: 附接既有 Git Project
- **WHEN** Agent executes `buildr project create <code> --attach <absolute-path> --target <root>`
- **THEN** Buildr MUST核对独立Git top-level、remote、URL、integration branch与既有Domain identity
- **AND** MUST记录`source.type: git`、`root: attached`与绝对path
- **AND** MUST NOT clone、copy、move、repair baseline或写Attached Root内容

#### Scenario: 创建 Project 时提供说明
- **WHEN** Agent executes `buildr project create <code> --name <name> --description <description> --target <root>`
- **THEN** Buildr MUST record the provided name and description
- **AND** Buildr MUST accept legacy `--title` as compatibility input but canonical help and output MUST use `--name`
- **AND** Buildr MUST NOT write the description into Project OpenSpec specs or knowledge as an authoritative project fact

#### Scenario: 既有目录由 project create 补登记
- **WHEN** Agent executes managed `buildr project create <code> --target <root>` and `<root>/projects/<code>/` already exists
- **THEN** Buildr MUST validate source identity before repairing baseline assets and updating the registry
- **AND** Buildr MUST preserve an existing canonical Project UUID
- **AND** Buildr MUST NOT overwrite existing Project files

### Requirement: Project repo boundaries
Buildr MUST 根据 ProjectSource 的真实 topology 与 ownership在root Workspace repo、独立managed Project repos和Attached Roots之间保持清晰Git边界。

#### Scenario: workspace source follows root Git
- **WHEN** a managed Project has `source.type: workspace`
- **THEN** Buildr MUST treat `source.path` as root Workspace assets
- **AND** Buildr MUST NOT add that path to root `.gitignore`

#### Scenario: Git source is ignored by root Git
- **WHEN** a managed Project has `source.type: git`
- **THEN** Buildr MUST ensure root `.gitignore` ignores `source.path`
- **AND** Buildr MUST NOT require the root Git repo to store the nested Project repo contents

#### Scenario: Attached Root不修改Workspace ignore
- **WHEN** a Project has `source.root: attached`
- **THEN** Buildr MUST按实际Git topology观察repository boundary
- **AND** MUST NOT向Workspace或Attached Root `.gitignore`写入由目录形状推导的规则
