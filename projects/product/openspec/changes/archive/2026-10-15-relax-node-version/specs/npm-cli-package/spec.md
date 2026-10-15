## MODIFIED Requirements

### Requirement: 开发 checkout 必须从 Buildr Service package root 运行并保留 Project bridge
Buildr MUST 将 `projects/product/services/buildr` 作为 development checkout 的 npm package root，并 MUST 保留 `projects/product/buildr` 作为稳定且唯一的 checkout 开发 CLI 入口；source discovery、诊断和 self-bootstrap 必须识别二者属于同一 Product checkout。Project bridge MUST只使用Product checkout声明最低版本要求的开发Node启动Service CLI；package `engines.node`继续只表达npm正式安装的Host Node兼容范围。机器默认PATH中的`buildr` MUST保留给npm installation，canonical development preparation、self-bootstrap和release preparation MUST NOT创建、覆盖或要求该入口绑定development checkout。

#### Scenario: 从 Service package root 打包
- **WHEN** 维护者从 `projects/product/services/buildr` 运行 `npm pack`
- **THEN** tarball MUST 使用既有 `@buildr-ai/buildr` identity 和 `bin/buildr.mjs`
- **AND** package inventory MUST 只包含 Service root 内声明的发布文件

#### Scenario: 从 Project bridge 启动开发 CLI
- **WHEN** 用户运行 `projects/product/buildr <command>`，且`BUILDR_NODE`或受控PATH候选提供Product声明最低版本要求的开发Node
- **THEN** bridge MUST使用该实际Node并从`projects/product/services/buildr`启动CLI
- **AND** CLI MUST 从该 Service root 解析 package identity、runtime dependencies 和交付资产
- **AND** 输出的 development checkout source MUST 关联当前 workspace 和 Product Service

#### Scenario: 显式选择开发 Node
- **WHEN** 用户通过 `BUILDR_NODE` 指定可执行Node
- **THEN** Project bridge MUST只在其稳定版本不低于Product声明的最低版本时启动Service CLI
- **AND** 低于最低版本、预发布或非法版本的override MUST fail closed；满足最低版本的override MUST被接受

#### Scenario: 当前环境没有兼容 Node
- **WHEN** `BUILDR_NODE`、PATH和当前Agent runtime可发现位置都没有Product声明最低版本要求的Node
- **THEN** Project bridge MUST 以非零状态退出
- **AND** 诊断 MUST 说明最低版本并给出设置 `BUILDR_NODE` 或调整 PATH 的恢复动作
- **AND** MUST NOT静默回退显式无效override或暴露由不兼容Node解析ESM产生的语法错误作为首要诊断

#### Scenario: 安装本机开发入口
- **WHEN** 维护者运行 canonical development preparation、self-bootstrap 或 release preparation
- **THEN** Buildr MUST通过当前retained checkout的`projects/product/buildr`与同一实际开发Node执行命令
- **AND** MUST NOT创建、覆盖、删除或要求PATH中的默认`buildr`指向development checkout

### Requirement: 开发入口必须消费显式供给或声明范围内的 Node
Product development Node resolver MUST 在未提供 `BUILDR_NODE` 时按以下顺序选择 Node：显式 `NVM_DIR` 中与 `.node-version` 声明版本精确匹配的 Node、PATH 上首个满足开发 Node 范围（稳定版本不低于声明的最低版本，当前为 `>=24.15.0`，不设主版本上限）的候选；显式 `BUILDR_NODE` 供给 MUST 满足该范围且优先生效；resolver MUST 在启动任何 Node 或 npm Product 命令前完成选择。它 MUST NOT 扫描未声明的用户目录或下载 runtime。满足范围但不等于声明版本的 Node MUST 被接受为本地兼容路径，实际选择的可执行文件与版本 MUST 进入身份记录。

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
