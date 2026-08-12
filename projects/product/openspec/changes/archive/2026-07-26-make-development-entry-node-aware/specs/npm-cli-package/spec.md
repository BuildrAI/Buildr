## MODIFIED Requirements

### Requirement: 开发 checkout 必须从 Buildr Service package root 运行并保留 Project bridge
Buildr MUST 将 `projects/product/services/buildr` 作为 development checkout 的 npm package root，并 MUST 保留 `projects/product/buildr` 作为稳定兼容入口；source discovery、安装、自更新和诊断必须识别二者属于同一 Product checkout。Project bridge MUST 使用满足 package `engines.node` 的 Node 启动 Service CLI，并在当前环境没有兼容 Node 时返回可操作诊断。

#### Scenario: 从 Service package root 打包
- **WHEN** 维护者从 `projects/product/services/buildr` 运行 `npm pack`
- **THEN** tarball MUST 使用既有 `@buildr-ai/buildr` identity 和 `bin/buildr.mjs`
- **AND** package inventory MUST 只包含 Service root 内声明的发布文件

#### Scenario: 从 Project bridge 启动开发 CLI
- **WHEN** 用户运行 `projects/product/buildr <command>`，且 PATH 或当前 Agent runtime 提供满足 `engines.node` 的 Node
- **THEN** bridge MUST 自动选择兼容 Node 并从 `projects/product/services/buildr` 启动 CLI
- **AND** CLI MUST 从该 Service root 解析 package identity、runtime dependencies 和交付资产
- **AND** 输出的 development checkout source MUST 关联当前 workspace 和 Product Service

#### Scenario: 显式选择开发 Node
- **WHEN** 用户通过 `BUILDR_NODE` 指定可执行且满足 `engines.node` 的 Node
- **THEN** Project bridge MUST 优先使用该 Node 启动 Service CLI
- **AND** 不得被 PATH 中更早出现的不兼容 Node 覆盖

#### Scenario: 当前环境没有兼容 Node
- **WHEN** `BUILDR_NODE`、PATH 和当前 Agent runtime 可发现位置都没有满足 `engines.node` 的 Node
- **THEN** Project bridge MUST 以非零状态退出
- **AND** 诊断 MUST 说明最低 Node 版本并给出设置 `BUILDR_NODE` 或调整 PATH 的恢复动作
- **AND** MUST NOT 暴露由不兼容 Node 解析 ESM 产生的语法错误作为首要诊断

#### Scenario: 安装本机开发入口
- **WHEN** 维护者运行 Buildr Service 的 `scripts/install-buildr-cli`
- **THEN** 安装链接 MUST 指向 Service `bin/buildr.mjs`
- **AND** 冲突检查 MUST 识别旧 Project package root 与新 Service package root 的 Buildr-managed identity
