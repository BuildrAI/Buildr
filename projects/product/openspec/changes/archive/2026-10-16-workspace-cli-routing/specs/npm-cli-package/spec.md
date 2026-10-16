## MODIFIED Requirements

### Requirement: installed CLI uses package assets
前置工作空间（Workspace）来源选择决定由当前 npm 安装执行时，已安装的 `buildr` command MUST 使用 npm package 中包含的 `resources/`、`web-dist/` 和明确发布的 runtime assets，而不是要求访问 development checkout。

#### Scenario: Initialize workspace from installed command
- **WHEN** 前置选择保持当前 npm 安装，且 the installed `buildr` command runs `buildr init --target <dir> --name <name> --profile <profile>`
- **THEN** Buildr MUST create the default workspace baseline from packaged `resources/`
- **AND** the workspace MUST NOT require files outside the installed npm package

#### Scenario: Complete onboarding from installed command
- **WHEN** 前置选择保持当前 npm 安装，且 the installed `buildr` command runs `buildr init --agent <agent> --target <dir> --name <name> --profile <profile>`
- **THEN** Buildr MUST create the workspace baseline, install the product Buildr Skill, reconcile the selected Agent runtime, and run final doctor using only packaged assets
- **AND** the command MUST behave consistently with the checkout-based CLI for the same inputs

#### Scenario: Run onboarding commands from installed command
- **WHEN** 前置选择保持当前 npm 安装，且 the installed `buildr` command runs `assets`, `project create`, `service create`, `doctor`, `sync`, `runtime check`, `rules render`, or `skills render`
- **THEN** each command MUST behave consistently with the checkout-based CLI for the same inputs
- **AND** 开发维护命令 `package check` MUST 明确要求开发检出目录，不将其描述为安装包健康检查

#### Scenario: Read recovery guidance without a working CLI
- **WHEN** 已安装命令无法启动，或本机无法联网
- **THEN** 安装包 MUST 保留源自现有 `docs/cli-reference.md` 的离线参考，包含首次安装、入口缺失、同步中断及恢复边界
- **AND** MUST 不重新创建 bootstrap 指南或命令；开发源码及未随包参考的链接不承诺离线可达

#### Scenario: 已登记开发来源的资产责任
- **WHEN** 默认 npm 入口按有效工作空间（Workspace）归属委派到开发来源
- **THEN** 被选中的开发入口 MUST 使用自己的源码与交付资产
- **AND** npm 入口 MUST NOT 先加载本包业务运行时（Runtime）或将本包资产身份注入开发来源

### Requirement: 开发 checkout 必须从 Buildr Service package root 运行并保留 Project bridge
Buildr MUST 将 `projects/product/services/buildr` 作为 development checkout 的 npm package root，并 MUST 保留 `projects/product/buildr` 作为稳定且唯一的 checkout 开发 CLI 入口；source discovery、诊断和 self-bootstrap 必须识别二者属于同一 Product checkout。Project bridge MUST只使用Product checkout声明最低版本要求的开发Node启动Service CLI；package `engines.node`继续只表达npm正式安装的Host Node兼容范围。机器默认PATH中的`buildr` MUST保留给npm installation，canonical development preparation、self-bootstrap和release preparation MUST NOT创建、覆盖或要求该入口绑定development checkout。
默认 npm 入口 MAY 按已验证的工作空间（Workspace）管理归属委派到该显式开发入口；该委派 MUST NOT 改变 PATH 入口所有权，且显式开发入口 MUST 不进行按目录选版。

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

#### Scenario: 默认入口委派不创建开发安装
- **WHEN** 默认 npm `buildr` 为开发版已登记工作空间（Workspace）委派到开发入口
- **THEN** PATH 中的 `buildr` MUST 继续由原 npm 安装拥有
- **AND** 开发准备与自举 MUST NOT 因此创建、替换或要求默认入口指向开发目录

### Requirement: npm CLI 与本机 Launcher 必须共享安装身份
Buildr MUST 将 npm package 作为唯一正式产品 installation，并 MUST 让未委派的 CLI 与本地图形 Launcher 共享同一 npm installation identity、Buildr version、protocol identity、`applicationPayloadDigest`、Host Node executable、package entry 和 npm prefix。Launcher MUST 是可重建投射，不得成为平台 installation、复制 payload 或建立独立更新事实；来源 MUST 由 formal npm origin、payload binding 与 ownership receipt 证明，不得根据 PATH 或文件名猜测。Development checkout MUST只拥有显式 Project bridge 与隔离的 `Buildr Web Dev` Launcher，不得创建第二个机器默认 CLI installation。
默认 CLI 前置选择 MAY 为已登记工作空间（Workspace）委派到其开发来源；该动作 MUST NOT 改写 npm 或图形启动器（Launcher）的绑定身份，图形启动 MUST 保持显式绑定来源。

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
- **THEN** Buildr MUST先通过唯一开发准备入口生成当前 HTTP DTO 与 ignored `web-dist`，再将 `Buildr Web Dev` 绑定当前 checkout 和 development runtime
- **AND** 干净 checkout 缺少任一生成输入时必须在 Launcher 变更前生成或明确失败，不得安装一个启动后返回 `web_dist_missing` 的 Launcher
- **AND** MUST NOT创建或覆盖默认 PATH CLI、npm installation 或 npm-owned `Buildr Web` Launcher

#### Scenario: 默认 CLI 按归属委派
- **WHEN** 默认 npm CLI 的工作空间（Workspace）命令被委派到开发来源
- **THEN** 执行结果 MUST 反映所选开发来源的身份
- **AND** 原 npm 安装及其图形启动器（Launcher）MUST 保留各自绑定身份与更新责任

### Requirement: npm发行版运行时不得依赖development准备事实
前置工作空间（Workspace）来源选择保持 npm 安装执行时，npm安装的Buildr CLI、Launcher与`buildr web`其产品启动、package entry和Web静态负载 MUST只消费已安装package、安装回执、兼容Host Node及随包`web-dist`，并 MUST NOT读取Product源码`preparation.yml`、源码`node_modules`、源码TypeScript或要求用户设置`BUILDR_NODE`。Workspace命令 MAY且在其既有契约要求时 MUST读取目标用户Workspace的Rules、Project declarations、runtime projection与其他权威资产；这些目标Workspace输入 MUST NOT被误判为Product development依赖。
默认入口的前置选择 MAY 只读现有本机管理及开发启动登记以发现目标来源；MUST 不初始化本包业务运行时（Runtime），不得为 npm 执行引入开发准备依赖。被选中的开发执行 MUST 由其已验证的显式入口和 Node 承担，不能把开发依赖伪装为 npm 正常运行要求。

#### Scenario: 用户在普通Workspace运行发行版CLI
- **WHEN** 前置选择保持 npm 执行，且用户通过npm installation执行`buildr doctor`、`sync`、`update`或其他发行版命令
- **THEN** CLI MUST从安装回执与package entry使用兼容Host Node启动
- **AND** MUST不查找Product checkout的精确development Node或源码依赖，但doctor与sync仍 MUST按各自契约读取目标Workspace authority

#### Scenario: 用户运行发行版Buildr Web
- **WHEN** 前置选择保持 npm 执行，且用户执行npm installation的`buildr web`或已验证Launcher binding
- **THEN** runtime MUST托管该package携带的`web-dist`
- **AND** MUST不安装Buildr Web源码依赖、运行源码TypeScript/Vite或读取Task preparation closure

#### Scenario: 发行资产泄漏源码依赖
- **WHEN** npm tarball或Launcher smoke发现入口需要`BUILDR_NODE`、Product checkout、源码`node_modules`或源码TypeScript
- **THEN** Candidate或发布验证 MUST将其判为发行缺陷并失败
- **AND** MUST不把设置环境变量或安装源码依赖作为用户恢复动作

#### Scenario: 不存在开发登记的普通 npm 使用
- **WHEN** 用户的普通工作空间（Workspace）未登记开发管理归属且本机没有开发检出目录
- **THEN** 默认入口和 npm 代表性命令 MUST 仍仅凭已安装包及兼容宿主 Node 正常执行
- **AND** MUST NOT 要求创建开发登记、安装源码依赖或设置 `BUILDR_NODE`
