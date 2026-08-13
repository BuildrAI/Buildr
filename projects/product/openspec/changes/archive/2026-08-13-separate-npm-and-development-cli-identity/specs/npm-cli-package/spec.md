## MODIFIED Requirements

### Requirement: 开发 checkout 必须从 Buildr Service package root 运行并保留 Project bridge
Buildr MUST 将 `projects/product/services/buildr` 作为 development checkout 的 npm package root，并 MUST 保留 `projects/product/buildr` 作为稳定且唯一的 checkout 开发 CLI 入口；source discovery、诊断和 self-bootstrap 必须识别二者属于同一 Product checkout。Project bridge MUST 使用满足 package `engines.node` 的 Node 启动 Service CLI，并在当前环境没有兼容 Node 时返回可操作诊断。机器默认 PATH 中的 `buildr` MUST 保留给 npm installation，canonical development preparation、self-bootstrap 和 release preparation MUST NOT 创建、覆盖或要求该入口绑定 development checkout。

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
- **WHEN** 维护者运行 canonical development preparation、self-bootstrap 或 release preparation
- **THEN** Buildr MUST通过当前 retained checkout 的 `projects/product/buildr` 执行开发 CLI 命令
- **AND** MUST NOT创建、覆盖、删除或要求 PATH 中的默认 `buildr` 指向 development checkout

### Requirement: npm CLI 与本机 Launcher 必须共享安装身份
Buildr MUST 将 npm package 作为唯一正式产品 installation，并 MUST 让 CLI 与本地图形 Launcher 共享同一 npm installation identity、Buildr version、protocol identity、`applicationPayloadDigest`、Host Node executable、package entry 和 npm prefix。Launcher MUST 是可重建投射，不得成为平台 installation、复制 payload 或建立独立更新事实；来源 MUST 由 formal npm origin、payload binding 与 ownership receipt 证明，不得根据 PATH 或文件名猜测。Development checkout MUST只拥有显式 Project bridge 与隔离的 `Buildr Web Dev` Launcher，不得创建第二个机器默认 CLI installation。

#### Scenario: 安装 npm Buildr
- **WHEN** 用户通过 npm 安装 `@buildr-ai/buildr`
- **THEN** 用户 MUST 能运行完整 CLI 与 `buildr web`
- **AND** 普通安装 MUST NOT 自动创建 Applications、Start Menu、SEA、Product Node 或 installer

#### Scenario: 显式安装图形 Launcher
- **WHEN** 用户从可验证 npm installation 执行 `buildr web launcher install`
- **THEN** Buildr MUST 创建只引用同一 Host Node 与 package entry 的本机 Launcher，并将公开动作固定为 `web`
- **AND** Launcher MUST NOT 复制 Node、Buildr package、源码、payload 或 `node_modules`

#### Scenario: 多个 npm installation 同时存在
- **WHEN** 不同 prefix 或 Host Node 的多个 npm Buildr 同时登记
- **THEN** status MUST 分别展示 installation 与 Launcher ownership identity、version、path、runtime、protocol/payload identity
- **AND** 同一版本或 executable 文件名相同 MUST NOT 导致 lifecycle 合并或 target 覆盖

#### Scenario: 开发者准备 Buildr checkout
- **WHEN** 开发者从 Buildr Service checkout 执行 `npm run install:development`
- **THEN** Buildr MUST只将 `Buildr Web Dev` 绑定当前 checkout 和 development runtime
- **AND** MUST NOT创建或覆盖默认 PATH CLI、npm installation 或 npm-owned `Buildr Web` Launcher
