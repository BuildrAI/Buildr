## ADDED Requirements

### Requirement: npm CLI 与本机 Launcher 必须共享安装身份
Buildr MUST 将 npm package 作为唯一正式产品 installation，并 MUST 让 CLI 与本地图形 Launcher 共享同一 npm installation identity、Buildr version、protocol identity、`applicationPayloadDigest`、Host Node executable、package entry 和 npm prefix。Launcher MUST 是可重建投射，不得成为平台 installation、复制 payload 或建立独立更新事实；来源 MUST 由 formal npm origin、payload binding 与 ownership receipt 证明，不得根据 PATH 或文件名猜测。

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
- **WHEN** 开发者从 Buildr Service checkout 执行 canonical 开发准备入口
- **THEN** Buildr MUST 将开发 CLI 与 `Buildr Web Dev` 绑定当前 checkout 和 development runtime
- **AND** MUST NOT 覆盖 npm installation 或 npm-owned `Buildr Web` Launcher

### Requirement: npm 与 development 安装必须拥有明确更新责任
Buildr MUST 让 npm 与 development 只更新各自拥有的 installation，并 MUST 在版本、source root、Host Node、package entry、prefix 或 ownership identity 不一致时提供可解释诊断。当前产品 MUST NOT 声明 platform installer 更新渠道。

#### Scenario: 更新 npm CLI 与已安装 Launcher
- **WHEN** registry CLI 成功更新相同 prefix 的 `@buildr-ai/buildr`
- **THEN** Buildr MUST 只更新该 npm package，并对已存在且 ownership 匹配的 Launcher 原子刷新 binding
- **AND** 从未显式安装 Launcher 时 MUST 保持零桌面副作用

#### Scenario: 更新开发 Launcher
- **WHEN** 开发 checkout 执行 canonical launcher 更新入口
- **THEN** Buildr MUST 只切换 development channel 的 checkout/runtime identity
- **AND** MUST NOT 修改 npm prefix 或 npm-owned Launcher

### Requirement: npm Launcher 投射必须接受生命周期验证
Buildr Product Candidate MUST 验证 npm-owned macOS 与 Windows Launcher 的 binding、结构、显式安装、启动、更新刷新、漂移阻断、repair 与 ownership-safe uninstall。Launcher MUST 使用已登记 npm Buildr，MUST NOT self-contained 或依赖 development checkout。

#### Scenario: 验证 macOS 本机 Launcher
- **WHEN** Candidate 从隔离 npm prefix 显式安装 `Buildr Web.app`
- **THEN** verification MUST 证明 Bundle 不含 Node、Buildr package、payload 或独立 runtime，并只使用 absolute Host Node 与 package entry 启动 `web`
- **AND** 普通 npm install MUST NOT 创建该 Bundle

#### Scenario: 验证 Windows 本机 Launcher
- **WHEN** Candidate 从隔离 npm prefix 显式安装 Start Menu `Buildr Web` shortcut
- **THEN** verification MUST 证明 shortcut target/arguments 精确绑定 Host Node、package entry 与 `web`
- **AND** MUST NOT 通过 PATH、`.cmd` shim 或另一个 prefix 查找 Buildr

#### Scenario: 验证漂移与卸载
- **WHEN** Host Node、entry、package root、payload、prefix 或 ownership receipt 漂移，或用户执行 launcher uninstall
- **THEN** 启动/status MUST fail closed 并给出 repair，uninstall MUST 只删除 matching ownership 的 Launcher 投射
- **AND** npm package、Workspace Registry、SQLite、日志和 Workspace data MUST 保留

### Requirement: npm Buildr 主进程与 Workspace Node 子进程必须分离
Buildr MUST 只让 Workspace-owned npm、验证、Finish adapter 和项目执行消费 `.buildr/workspace.yml` 声明的精确 Workspace Node identity。npm Buildr 主进程及其本地图形 Launcher MUST 始终使用 formal installation 绑定的兼容 Host Node。进入或选择 Workspace MUST NOT 隐式重启主进程、替换 Host Node 或把 Workspace Node 合并为宿主 runtime identity。

#### Scenario: 已声明 runtime 可用
- **WHEN** Workspace 已声明 Node 且受管 runtime 可用，npm Buildr 执行 Workspace-owned subprocess
- **THEN** subprocess resolver MUST 使用声明版本与 identity 启动 npm、verification、Finish adapter 或项目命令
- **AND** Buildr 主进程 MUST 继续报告并使用相同 Host Node

#### Scenario: runtime 缺失时执行普通命令
- **WHEN** Workspace 声明存在但 runtime 缺失，操作需要 Workspace-owned Node subprocess
- **THEN** 该操作 MUST fail closed 并建议 `sync`
- **AND** MUST NOT 从 PATH 或 Host Node 选择替代版本执行 Workspace-owned 工作

### Requirement: npm package 与 Launcher 必须共享同一 Buildr Web 负载
Buildr npm package MUST 包含 application payload 中 Buildr Web 运行所需的正式 Web dist；development checkout MUST 使用当前 checkout 对应的已验证正式 dist。development CLI、已安装 npm CLI 与 npm-owned Launcher 启动 `buildr web` 时 MUST 托管行为一致的 Buildr Web shell。Launcher MUST 引用 package 内资源而不是包含第二份 Web dist，且所有入口 MUST NOT 要求 `buildr-web` 源码或 Vite toolchain。

#### Scenario: 检查 packed Web dist
- **WHEN** verification 检查唯一 `npm pack` tarball
- **THEN** package MUST 包含服务 shell 所需的精确 payload Web dist 并报告 `applicationPayloadDigest`
- **AND** package MUST 包含 Launcher 管理代码但 MUST NOT 包含已生成 `.app`、shortcut、Node 或平台 installer

#### Scenario: npm Launcher 启动 Web
- **WHEN** 用户打开由当前 npm installation 显式生成的图形 Launcher
- **THEN** Launcher MUST 使用已绑定 Host Node 与 package entry 执行 `web` 并服务 package 内同一 Web dist
- **AND** MUST NOT形成 source-tree hosting、CLI-only 分支或独立 Launcher 业务实现

#### Scenario: package build 消费 buildr-web 输出
- **WHEN** 维护者或 CI 构建 npm application payload
- **THEN** 构建 MUST 只消费已进入 `buildr` authority 的正式 Web dist
- **AND** npm pack 与 Launcher install MUST NOT 需要 `projects/product/services/buildr-web` 或重建前端资源

## MODIFIED Requirements

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
- **THEN** installation 或 Launcher MUST fail closed 并报告受支持范围
- **AND** MUST NOT 下载 Product Node、切换 Workspace Node 或从 PATH 选择其他 Node 掩盖不兼容

## REMOVED Requirements

### Requirement: CLI 与平台 Launcher 必须共享产品身份但保持安装事实独立
**Reason**: 当前没有平台 Launcher；本机 Launcher 属于同一 npm installation。
**Migration**: 使用新增的 npm CLI 与本机 Launcher installation identity 要求。

#### Scenario: 共享 npm installation identity
- **WHEN** CLI 与 Launcher 报告当前产品身份
- **THEN** MUST 引用同一 formal npm installation

### Requirement: 各安装渠道必须拥有明确的更新责任
**Reason**: 当前正式渠道只有 npm，另保留隔离的 development channel。
**Migration**: 使用新增的 npm/development 更新责任要求。

#### Scenario: 隔离更新责任
- **WHEN** npm 或 development update 执行
- **THEN** MUST 只修改自身拥有的 installation

### Requirement: Launcher 发布产物必须接受安装生命周期验证
**Reason**: Launcher 不再是发布产物，而是本机生成的 npm installation 投射。
**Migration**: 使用新增的 npm Launcher lifecycle requirement。

#### Scenario: 验证本机投射生命周期
- **WHEN** Candidate 验证 Launcher
- **THEN** MUST 从 npm installation 执行 install/status/repair/uninstall

### Requirement: 已初始化 Workspace 的 Buildr 入口必须消费 Workspace Node identity
**Reason**: 旧措辞会让主进程切换到 Workspace Node；当前只有 Workspace-owned subprocess 消费该 runtime。
**Migration**: 使用新增的 Host main process 与 Workspace child separation requirement。

#### Scenario: 分离主进程与子进程
- **WHEN** npm Buildr 在 Workspace 中执行 Workspace-owned command
- **THEN** 主进程 MUST 保持 Host Node且子进程 MUST 使用 Workspace Node

### Requirement: npm package 与 launcher 必须包含 Buildr Web 构建产物并保持三入口一致
**Reason**: Launcher 不包含第二份 Web dist，只引用 npm payload。
**Migration**: 使用新增的共享同一 Buildr Web payload 要求。

#### Scenario: Launcher 引用 npm Web payload
- **WHEN** npm-owned Launcher 启动 Web
- **THEN** MUST 使用 package 内同一 payload且不得复制 Web dist
