# cli-product-surface Delta Spec

## ADDED Requirements

### Requirement: `buildr artifact` 命令族进入命令目录与产品表面分类

Buildr CLI MUST 在封闭可验证的 command metadata catalog 中登记 `buildr artifact register`、`buildr artifact list`、`buildr artifact status`、`buildr artifact release` 与 `buildr artifact clean`，并将该命令族归类为 `agent-machine` 产品表面；canonical help、主题帮助与 `--json` 输出 MUST 共享同一命令元数据 authority。未持有 workspace 目标时命令 MUST 返回稳定非零退出码与可执行下一步，不得默认输出完整 usage。

#### Scenario: 命令目录可验证

- **WHEN** 产品验证核对 command metadata catalog
- **THEN** `artifact` 命令族 MUST 有 canonical key、`agent-machine` surface、summary、帮助与 JSON 契约声明
- **AND** 不得出现在 `primary` 日常资产管理入口的推荐位置

#### Scenario: 缺少 workspace 目标

- **WHEN** 在不带 `--target` 且无法定位 canonical Workspace 的位置执行 `buildr artifact list`
- **THEN** CLI MUST 返回稳定非零退出码与定位 workspace 的下一步提示
- **AND** MUST NOT 在错误根下扫描或写入登记目录
