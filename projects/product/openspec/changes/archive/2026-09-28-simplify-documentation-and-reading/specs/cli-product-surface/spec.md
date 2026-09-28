## MODIFIED Requirements

### Requirement: service create rules 参数仅作为兼容 no-op
Buildr MUST 将 `service create --rules <path>` 保留为 deprecated legacy compatibility no-op，而 Service Rule 的唯一 canonical 入口 MUST 是 Service 目录层级的 `AGENTS.md`。

#### Scenario: 旧调用携带 rules 参数
- **WHEN** Agent 调用 `buildr service create <project>/<service> <repo-ref> --rules <path>`
- **THEN** Buildr MUST 保持不带该参数时的 Service 创建和登记语义
- **AND** Buildr MUST 输出 deprecated 与迁移提示
- **AND** Buildr MUST NOT 读取、验证、复制或持久化 `<path>`，也不得向 Service manifest 写入 rule-source 字段

#### Scenario: Canonical Service help
- **WHEN** 用户查看根帮助、`service create --help`、命令参考或当前产品示例
- **THEN** canonical usage MUST NOT 包含 `--rules`
- **AND** Service 主题说明 MUST 指向目录层级 `AGENTS.md` 约定

## ADDED Requirements

### Requirement: 退休指南正文输出命令
Buildr MUST 删除 `buildr bootstrap guide` 的可执行路由、帮助主题、候选提示和随包 `docs/bootstrap-guide.md`，MUST NOT 保留隐藏别名或第二份指南正文。初始化、同步、产品技能（Skill）安装与事务恢复能力 MUST 继续保留。

#### Scenario: 旧命令或帮助请求
- **WHEN** 调用方运行 `buildr bootstrap guide`、`buildr bootstrap guide --help` 或 `buildr help bootstrap guide`
- **THEN** 开发入口与正式安装入口 MUST 返回标准未知命令或未知帮助主题，并以 2 退出
- **AND** MUST NOT 读取或写入工作空间（Workspace）文件，候选建议 MUST NOT 推荐该退休命令

#### Scenario: 资产帮助提供可执行输入依据
- **WHEN** 智能体（Agent）运行 `buildr help assets` 或 `buildr assets --help`
- **THEN** 帮助 MUST 说明现有动作的输入字段、当前 `revision` 与目录观察要求，并提供可替换实际身份后执行的最小示例
- **AND** MUST 说明关联提交完整 `serviceIds`，移除只取消登记，登记代码来源不等于克隆
- **AND** 帮助 MUST 可离线读取且不要求已初始化的工作空间（Workspace），MUST NOT 将旧 `service create` 描述为全局资产主入口
