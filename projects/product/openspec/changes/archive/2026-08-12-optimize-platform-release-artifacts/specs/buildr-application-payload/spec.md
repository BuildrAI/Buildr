## ADDED Requirements

### Requirement: Buildr 必须只构建一份跨渠道应用负载
Buildr release preparation MUST 只构建一次平台无关应用负载，并 MUST 让 npm tarball 与每个正式平台制品消费完全相同的 payload bytes。负载 MUST 包含 CLI、Core/Application、SQLite migrations、Buildr Web HTTP/runtime、正式 Web dist、package baseline、运行依赖以及 Buildr version 和 protocol identity；MUST NOT 包含 Product Node、installer、平台 Launcher、`buildr-web` 源码或 Vite toolchain。

#### Scenario: 冻结公共 payload
- **WHEN** release contract 已解析且 payload builder 成功
- **THEN** builder MUST 产生规范化 payload manifest、runtime bundle、resource directory 和唯一 `applicationPayloadDigest`
- **AND** 后续 npm 与平台 job MUST 只消费该冻结输出，不得从 checkout 重新 bundle 或复制资源

#### Scenario: 跨渠道核对 payload
- **WHEN** verifier 比较 npm tarball 与任一平台制品 manifest
- **THEN** 两者 MUST 报告相同 Buildr version、protocol identity 和 `applicationPayloadDigest`
- **AND** 任一 payload file digest 不同 MUST 阻止候选发布

#### Scenario: 前端源码不进入负载
- **WHEN** verifier 检查 payload inventory
- **THEN** inventory MUST 包含可直接由 Buildr Web Runtime 托管的正式 `web-dist`
- **AND** MUST NOT 包含 `buildr-web` source、Vite config、前端开发依赖或要求安装后执行 Vite

### Requirement: 应用负载 identity 必须确定且可逐文件证明
Payload builder MUST 使用排序后的相对路径、文件 mode、size 与 SHA-256 形成 canonical manifest 和 digest，并 MUST 排除时间戳、绝对 checkout path、runner 临时路径及其他构建机器噪音。构建器 MUST 在 SEA 注入和签名前核对 injected runtime bundle；每个 npm/platform 入口 MUST 在执行业务代码前校验 payload manifest 与可读取的真实资源。

#### Scenario: 相同输入重复构建
- **WHEN** 同一 commit、锁定依赖和 Web dist 输入重复构建 payload
- **THEN** 两次输出 MUST 具有相同 canonical manifest bytes 和 `applicationPayloadDigest`
- **AND** 任一非确定性差异 MUST 由构建验证报告并失败

#### Scenario: 注入 bundle 或资源被修改
- **WHEN** SEA 注入前的 runtime bundle 与冻结 manifest 不符，或 npm bundle、migration、Web asset、worker、baseline、许可证任一可读取 byte 与 manifest 不符
- **THEN** platform builder MUST 在签名前停止，npm/platform runtime MUST 在读取漂移资源或启动服务前 fail closed
- **AND** 诊断 MUST 报告 payload identity 与不匹配的相对资源，不得假装运行中 SEA 能反向读取 injected main blob，也不得回退到 development checkout

### Requirement: 真实文件资源必须具有明确 materialization 与清理边界
不能直接从 runtime bundle 读取的 Web dist、migrations、worker、baseline 和模板 MUST 位于 versioned、digest-verified 的 payload resource directory。平台安装 MUST 把该目录作为产品单元的一部分原子替换；npm MUST 从 tarball 内只读解析；临时 materialization MUST 使用 payload digest 隔离并只清理当前产品 ownership 可证明的内容。

#### Scenario: 平台解析资源
- **WHEN** SEA 在已安装产品中启动 CLI 或 `buildr web`
- **THEN** resource resolver MUST 从安装 identity 指定的目录解析资源并校验 payload digest
- **AND** MUST NOT 从 cwd、源码 checkout、PATH 或另一个 Buildr channel 查找资源

#### Scenario: 临时 materialization
- **WHEN** worker 或 runtime API 要求真实临时文件
- **THEN** Buildr MUST 将资源物化到带 payload identity 的受控 cache/staging root 并在使用前校验摘要
- **AND** 清理 MUST 只删除 matching ownership 与 payload identity 的 materialized resources

### Requirement: 产品进程重入与 Workspace Node 执行必须显式分类
Buildr runtime MUST NOT 将 `process.execPath` 无条件视为可执行任意 JavaScript 或 `-e` 的通用 Node。产品重入 MUST 使用同一 Buildr executable 的受控 internal command 或进程内 API；Workspace-owned npm、验证、Finish adapter 和项目执行 MUST 通过 Workspace Node resolver 使用声明的精确 executable。

#### Scenario: SEA 内产品重入
- **WHEN** 平台 runtime 需要启动 Buildr-owned worker 或重新进入某个产品动作
- **THEN** 它 MUST 使用登记的 product re-entry/worker contract
- **AND** MUST NOT 执行 `process.execPath <script>`、`process.execPath -e` 或从 PATH 查找 Node

#### Scenario: Workspace-owned subprocess
- **WHEN** Buildr 为 Workspace 执行 npm、verification、Finish adapter 或项目命令
- **THEN** resolver MUST 使用 `.buildr/workspace.yml` 声明的 Workspace Node identity
- **AND** Product Node、npm host Node 与 Workspace Node 即使版本相同也 MUST 保持不同的 identity 和 lifecycle evidence

### Requirement: 应用负载必须保留产品与依赖许可证
Payload MUST 包含其分发的 Buildr 与生产依赖许可证 inventory；平台产品层 MUST 额外保留官方 Node executable 对应的 Node 许可证和来源 checksum evidence。构建 MUST NOT 因裁剪 Node 开发目录而丢失必须随二进制分发的许可证。

#### Scenario: 检查许可证 inventory
- **WHEN** release verifier 检查 npm 或平台候选
- **THEN** 候选 MUST 列出 payload 中实际分发的生产依赖及许可证
- **AND** 平台候选 MUST 额外证明 Node version、官方来源 checksum 和 Node license bytes
