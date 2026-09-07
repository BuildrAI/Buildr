## ADDED Requirements

### Requirement: 开发入口必须消费显式版本管理器中的精确 Node
Product development Node resolver MUST 在未提供 `BUILDR_NODE` 时检查显式 `NVM_DIR` 中与 `.node-version` 精确匹配的 Node，且 MUST 在启动任何 Node 或 npm Product 命令前完成选择。它 MUST NOT 扫描未声明的用户目录、下载 runtime 或接受仅满足 `engines.node` 的其他版本。

#### Scenario: hostile PATH 下 NVM 已安装精确版本
- **WHEN** PATH 首位 Node 不等于 Product `.node-version`，且 `NVM_DIR/versions/node/v<required>/bin/node` 存在并报告精确版本
- **THEN** development Node/npm wrapper MUST 首次直接使用该精确 Node及其相邻 npm
- **AND** MUST NOT 先启动 PATH Node 或产生一次版本失败后再重试

#### Scenario: NVM 候选不匹配
- **WHEN** `NVM_DIR` 缺少精确版本、候选不可执行或报告不同版本，且其他受控候选也不可用
- **THEN** resolver MUST 保持非零失败并说明所需精确版本
- **AND** MUST NOT 选择其他兼容 Node、创建安装或扫描其他用户目录
