# openspec-upgrade-integration Specification

## Purpose
定义 Buildr 对经过评估的 OpenSpec 上游版本、planning update workflow、guard 职责边界、sidebar 组合和 Stores beta 范围的集成契约。

## Requirements

### Requirement: Buildr 受控交付 OpenSpec planning update workflow
Buildr MUST 将上游 `openspec-update-change` 作为可选的 planning-only workflow Skill 交付，并保持它与 Buildr task、Component 和 contract 边界一致。

#### Scenario: 用户修订已有 change 的 planning artifacts
- **WHEN** 用户要求更新、协调或修订已有 OpenSpec change 的既有 planning artifacts
- **THEN** `openspec-update-change` MUST 先通过 `openspec status --change <id> --json` 解析实际 change、artifact paths 和 `changeRoot`
- **AND** Skill MUST 只修改 status 返回的 `existingOutputPaths` 中的 planning artifacts
- **AND** Skill MUST 明确确认每项拟议修改
- **AND** Skill MUST NOT 创建缺失 artifact、修改实现代码、执行 apply、sync 或 archive

#### Scenario: planning 修订意味着实现变化
- **WHEN** `openspec-update-change` 识别出已确认的 planning 修改需要改变实现代码
- **THEN** Skill MUST 报告该影响并引导用户进入 `openspec-apply-change`
- **AND** Skill MUST NOT 自行开始代码实现或绕过 task-worktree 决策

#### Scenario: Buildr 为 update workflow 组合 sidebar
- **WHEN** enabled installed OpenSpec Component 的 runtime 投射 `openspec-update-change`
- **THEN** Buildr MUST 以经过 integrity 验证的上游 Skill source 为基础组合 Buildr sidebar contribution
- **AND** sidebar MUST 只补充从 planning 转入实现前重新执行 task-worktree 决策的 Buildr 特有约束
- **AND** sidebar MUST NOT 重复上游已有的 status/path 解析、planning-only、逐 artifact 确认或 apply 引导
- **AND** workspace 中的上游 Skill source MUST 保持未被 Buildr 修改

### Requirement: Buildr OpenSpec sidebars 只表达 Buildr 特有增量
Buildr MUST仅在上游workflow未覆盖且Buildr consumer需要该约束时保留OpenSpec Skill Contribution，并通过Component integrity和组合测试验证固定组合。

#### Scenario: 保留 Buildr 特有 sidebar
- **WHEN** sidebar约束task-worktree决策、Candidate evidence、proposal planning gate或Task Finish convergence gate
- **THEN** Buildr MUST保留并验证该contribution

#### Scenario: 上游已提供相同路径保证
- **WHEN** OpenSpec 1.6.0 workflow已通过status context解析change、artifact paths和`changeRoot`
- **THEN** Buildr MUST合并或删除只重复该保证的explore、sync或archive sidebar内容
- **AND** Buildr MUST NOT因删减重复文案而移除task-triage或Task Finish的安全门禁

#### Scenario: Sidebar 不建立独立 capability contract
- **WHEN** sidebar只作为OpenSpec Component固定组合中的自然语言增量且没有可替换provider
- **THEN** Buildr MUST使用Component member integrity和composition tests保护它
- **AND** Buildr MUST NOT为每个sidebar创建`provides`、`requires`或binding
- **AND** 现有task-worktree、task-verification、git-operations和task-finish capability contracts MUST保持有效，已退役Task Retrospective contract MUST不存在

### Requirement: Buildr 不将 OpenSpec Stores 作为默认受支持工作流
Buildr MUST 不因 OpenSpec 1.6.0 包含 Stores beta 而在默认 OpenSpec Component、Buildr Skills 或 Project 资产中声明、创建、迁移或操作 Store。

#### Scenario: 上游 CLI 暴露 Store 命令
- **WHEN** 用户安装的受支持 OpenSpec CLI 暴露 Store 相关命令
- **THEN** Buildr MUST 继续将其视为未纳入默认支持范围的上游能力
- **AND** Buildr MUST NOT 因 Component install、update、sync、runtime render 或 contract check 创建、迁移或修改 Store 数据

#### Scenario: 用户要求启用 Stores
- **WHEN** 用户要求 Buildr 管理、迁移或依赖 OpenSpec Stores
- **THEN** Agent MUST 说明该能力尚未纳入 Buildr 默认支持范围
- **AND** Agent MUST 先创建独立的评估与设计 change，再改变 Buildr source assets 或 Project workflow

### Requirement: OpenSpec 113 发布必须一致接入
Buildr MUST使依赖、命令声明、组件版本、支持版本、原样上游技能与完整性一致指向 OpenSpec 1.13.0，并用实际包验证标准规范、异常与恢复兼容。

#### Scenario: 升级候选验证
- **WHEN** 准备交付升级后的 Buildr 源码
- **THEN** 所有版本与源资产一致且相关检查通过；主机安装不被候选静默修改
