## MODIFIED Requirements

### Requirement: 开发 checkout 必须从 Buildr Service package root 运行并保留 Project bridge
Buildr MUST 将 `projects/product/services/buildr` 作为 development checkout 的 npm package root，并 MUST 保留 `projects/product/buildr` 作为稳定且唯一的 checkout 开发 CLI 入口；source discovery、诊断和 self-bootstrap 必须识别二者属于同一 Product checkout。Project bridge MUST只使用Product checkout声明的精确开发Node启动Service CLI；package `engines.node`继续只表达npm正式安装的Host Node兼容范围。机器默认PATH中的`buildr` MUST保留给npm installation，canonical development preparation、self-bootstrap和release preparation MUST NOT创建、覆盖或要求该入口绑定development checkout。

#### Scenario: 从 Service package root 打包
- **WHEN** 维护者从 `projects/product/services/buildr` 运行 `npm pack`
- **THEN** tarball MUST 使用既有 `@buildr-ai/buildr` identity 和 `bin/buildr.mjs`
- **AND** package inventory MUST 只包含 Service root 内声明的发布文件

#### Scenario: 从 Project bridge 启动开发 CLI
- **WHEN** 用户运行 `projects/product/buildr <command>`，且`BUILDR_NODE`或受控PATH候选提供Product声明的精确开发Node
- **THEN** bridge MUST使用该精确Node并从`projects/product/services/buildr`启动CLI
- **AND** CLI MUST 从该 Service root 解析 package identity、runtime dependencies 和交付资产
- **AND** 输出的 development checkout source MUST 关联当前 workspace 和 Product Service

#### Scenario: 显式选择开发 Node
- **WHEN** 用户通过 `BUILDR_NODE` 指定可执行Node
- **THEN** Project bridge MUST只在其版本精确等于Product声明时启动Service CLI
- **AND** 不兼容或仅满足`engines.node`但版本不精确的override MUST fail closed

#### Scenario: 当前环境没有兼容 Node
- **WHEN** `BUILDR_NODE`、PATH和当前Agent runtime可发现位置都没有Product声明的精确Node
- **THEN** Project bridge MUST 以非零状态退出
- **AND** 诊断 MUST 说明精确版本并给出设置 `BUILDR_NODE` 或调整 PATH 的恢复动作
- **AND** MUST NOT选择另一个兼容版本或暴露由不兼容Node解析ESM产生的语法错误作为首要诊断

#### Scenario: 安装本机开发入口
- **WHEN** 维护者运行 canonical development preparation、self-bootstrap 或 release preparation
- **THEN** Buildr MUST通过当前retained checkout的`projects/product/buildr`与同一精确开发Node执行命令
- **AND** MUST NOT创建、覆盖、删除或要求PATH中的默认`buildr`指向development checkout

### Requirement: npm tarball 必须使用宿主 Node 且排除平台运行时
`@buildr-ai/buildr` npm tarball MUST 使用满足 `engines.node` 的宿主 Node 运行完整 Buildr application payload，并 MUST 提供 CLI、`buildr web` 与本地 Launcher 管理能力。Tarball MUST NOT 包含 Node executable、Product Node、SEA、已生成 `.app`、`.pkg`、`.msi`、shortcut、installer metadata 或平台签名材料。

#### Scenario: 检查 npm inventory
- **WHEN** verifier 对唯一 `npm pack` tarball 检查文件清单和可执行文件
- **THEN** tarball MUST 包含 runtime bundle、payload manifest、Web dist、migrations、package baseline、Launcher 管理代码、生产依赖与许可证
- **AND** MUST NOT 包含 Node executable、已生成 Launcher、installer toolchain、`buildr-web` source、Vite toolchain、测试、fixtures、source maps 或开发依赖

#### Scenario: 在宿主 Node 安装运行
- **WHEN** tarball 安装到隔离 prefix 并由任一满足 `engines.node` 的 Host Node 执行
- **THEN** `buildr --help`、代表性 CLI、`buildr web --no-open`、health/readiness 与显式 Launcher lifecycle MUST 正常
- **AND** 普通非 Web CLI 与普通 npm install MUST NOT 启动 HTTP listener 或创建图形入口

#### Scenario: 不兼容宿主 Node
- **WHEN** npm consumer 使用不满足 `engines.node` 的 Node
- **THEN** installation 或 Launcher MUST fail closed并报告受支持范围
- **AND** MUST NOT下载Product Node或从PATH选择其他Node掩盖不兼容

## REMOVED Requirements

### Requirement: npm Buildr 主进程与 Workspace Node 子进程必须分离
**Reason**: Workspace Node子进程角色被删除；npm Buildr只保留formal Host Node identity。
**Migration**: Workspace commands按各自声明与当前受控环境执行，不再从`.buildr/workspace.yml`解析Node。

#### Scenario: runtime 缺失时执行普通命令
- **WHEN** 普通Workspace没有任何Node声明或受管Node runtime
- **THEN** npm Buildr MUST继续执行不需要Node的Workspace命令
