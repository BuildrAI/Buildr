## RENAMED Requirements

- FROM: `### Requirement: 开发入口必须消费显式版本管理器中的精确 Node`
- TO: `### Requirement: 开发入口必须消费显式供给或声明范围内的 Node`

## MODIFIED Requirements

### Requirement: 开发入口必须消费显式供给或声明范围内的 Node
Product development Node resolver MUST 在未提供 `BUILDR_NODE` 时按以下顺序选择 Node：显式 `NVM_DIR` 中与 `.node-version` 声明版本精确匹配的 Node、PATH 上首个满足开发 Node 范围（与声明版本同主版本且不低于声明版本，当前为 `>=24.15.0 <25`）的候选；显式 `BUILDR_NODE` 供给 MUST 满足该范围且优先生效；resolver MUST 在启动任何 Node 或 npm Product 命令前完成选择。它 MUST NOT 扫描未声明的用户目录或下载 runtime。满足范围但不等于声明版本的 Node MUST 被接受为本地兼容路径，实际选择的可执行文件与版本 MUST 进入身份记录。

#### Scenario: hostile PATH 下 NVM 已安装精确版本
- **WHEN** PATH 首位 Node 满足范围但不等于 Product 声明版本，且 `NVM_DIR/versions/node/v<required>/bin/node` 存在并报告精确版本
- **THEN** development Node/npm wrapper MUST 首次直接使用该声明版本 Node 及其相邻 npm
- **AND** MUST NOT 先启动 PATH Node 或产生一次版本失败后再重试

#### Scenario: NVM 候选不匹配
- **WHEN** `NVM_DIR` 缺少声明版本、候选不可执行或报告不同版本
- **THEN** resolver MUST 继续按发现顺序检查 PATH 上满足开发 Node 范围的候选，并在身份记录中保留实际选择
- **AND** MUST NOT 选择范围外的 Node、创建安装或扫描未声明的用户目录

#### Scenario: PATH 上存在满足范围但不等于声明版本的 Node
- **WHEN** 无 `BUILDR_NODE`、`NVM_DIR` 缺少声明版本，且 PATH 首位 Node 满足开发 Node 范围
- **THEN** resolver MUST 接受该 Node 并在身份记录中保留实际可执行文件与版本
- **AND** MUST NOT 因不等于声明版本而失败

#### Scenario: 显式供给超出范围立即失败
- **WHEN** `BUILDR_NODE` 指向的可执行文件不存在或版本不满足开发 Node 范围
- **THEN** resolver MUST 保持非零失败并说明所需范围与声明版本
- **AND** MUST NOT 回退选择其他候选
