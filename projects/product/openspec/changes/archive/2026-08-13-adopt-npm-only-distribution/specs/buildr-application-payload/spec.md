## ADDED Requirements

### Requirement: Buildr 必须构建唯一 npm 应用负载
Buildr release preparation MUST 只构建一次平台无关应用负载，并 MUST 让唯一 npm tarball 消费该冻结 payload。负载 MUST 包含 CLI、Core/Application、SQLite migrations、Buildr Web HTTP/runtime、正式 Web dist、package baseline、运行依赖以及 Buildr version 和 protocol identity；MUST NOT 包含 Node executable、SEA、installer、平台产品、`buildr-web` 源码或 Vite toolchain。

#### Scenario: 冻结 npm payload
- **WHEN** release contract 已解析且 payload builder 成功
- **THEN** builder MUST 产生规范化 payload manifest、runtime bundle、resource directory 和唯一 `applicationPayloadDigest`
- **AND** npm pack MUST 只消费该冻结输出，不得从 checkout 重新 bundle 或复制资源

#### Scenario: 前端源码不进入负载
- **WHEN** verifier 检查 payload inventory
- **THEN** inventory MUST 包含可直接由 Buildr Web Runtime 托管的正式 `web-dist`
- **AND** MUST NOT 包含 `buildr-web` source、Vite config、前端开发依赖或要求安装后执行 Vite

### Requirement: npm 应用负载 identity 必须确定且可逐文件证明
Payload builder MUST 使用排序后的相对路径、文件 mode、size 与 SHA-256 形成 canonical manifest 和 digest，并 MUST 排除时间戳、绝对 checkout path、runner 临时路径及其他构建机器噪音。npm 入口 MUST 在执行业务代码前校验 payload manifest 与可读取的真实资源。

#### Scenario: 相同输入重复构建
- **WHEN** 同一 commit、锁定依赖和 Web dist 输入重复构建 payload
- **THEN** 两次输出 MUST 具有相同 canonical manifest bytes 和 `applicationPayloadDigest`
- **AND** 任一非确定性差异 MUST 由构建验证报告并失败

#### Scenario: npm payload 资源被修改
- **WHEN** npm bundle、migration、Web asset、worker、baseline 或许可证任一可读取 byte 与 manifest 不符
- **THEN** npm runtime MUST 在读取漂移资源或启动服务前 fail closed
- **AND** 诊断 MUST 报告 payload identity 与不匹配的相对资源，不得回退到 development checkout

### Requirement: npm 真实文件资源必须具有明确 materialization 边界
不能直接从 runtime bundle 读取的 Web dist、migrations、worker、baseline 和模板 MUST 位于 npm tarball 内 versioned、digest-verified 的 payload resource directory。临时 materialization MUST 使用 payload digest 隔离并只清理当前 npm installation ownership 可证明的内容。

#### Scenario: npm 安装解析资源
- **WHEN** npm Buildr 启动 CLI 或 `buildr web`
- **THEN** resource resolver MUST 从已验证 package root 解析资源并校验 payload digest
- **AND** MUST NOT 从 cwd、源码 checkout、PATH 或另一个 Buildr installation 查找资源

#### Scenario: 临时 materialization
- **WHEN** worker 或 runtime API 要求真实临时文件
- **THEN** Buildr MUST 将资源物化到带 payload identity 的受控 cache/staging root并在使用前校验摘要
- **AND** 清理 MUST 只删除 matching ownership 与 payload identity 的 materialized resources

### Requirement: Host Node 产品重入与 Workspace Node 执行必须显式分类
Buildr runtime MUST NOT 将 `process.execPath` 无条件视为任意安装来源或 Workspace Node。npm 产品重入 MUST 使用已登记 Host Node 与 package entry 的受控 invocation；Workspace-owned npm、验证、Finish adapter 和项目执行 MUST 通过 Workspace Node resolver 使用声明的精确 executable。

#### Scenario: npm 产品重入
- **WHEN** npm runtime 需要启动 Buildr-owned worker 或重新进入某个产品动作
- **THEN** 它 MUST 使用当前 installation identity 绑定的 Host Node 与 package entry 或进程内 API
- **AND** MUST NOT 从 PATH 查找 `node`、`npm` 或 `buildr`

#### Scenario: Workspace-owned subprocess
- **WHEN** Buildr 为 Workspace 执行 npm、verification、Finish adapter 或项目命令
- **THEN** resolver MUST 使用 `.buildr/workspace.yml` 声明的 Workspace Node identity
- **AND** npm Host Node 与 Workspace Node 即使版本相同也 MUST 保持不同的 identity 和 lifecycle evidence

## MODIFIED Requirements

### Requirement: 应用负载必须保留产品与依赖许可证
Payload MUST 包含其分发的 Buildr 与生产依赖许可证 inventory。npm tarball MUST NOT 因 bundle 或资源裁剪而丢失必须随 package 分发的许可证。

#### Scenario: 检查许可证 inventory
- **WHEN** release verifier 检查 npm 候选
- **THEN** 候选 MUST 列出 payload 中实际分发的生产依赖及许可证
- **AND** Node 许可证 MUST 继续由用户安装的 Host Node distribution 负责，不得复制进 Buildr package 冒充 Product Node

## REMOVED Requirements

### Requirement: Buildr 必须只构建一份跨渠道应用负载
**Reason**: 当前不存在平台正式渠道，应用负载只服务唯一 npm tarball。
**Migration**: 使用新增的唯一 npm 应用负载要求。

#### Scenario: 迁移到唯一 npm payload
- **WHEN** release preparation 构建应用负载
- **THEN** MUST 只为唯一 npm tarball 冻结该负载

### Requirement: 应用负载 identity 必须确定且可逐文件证明
**Reason**: 旧标题隐含跨渠道载体；当前 identity 权威是 npm payload。
**Migration**: 使用新增的 npm 应用负载 identity 要求。

#### Scenario: 迁移到 npm payload identity
- **WHEN** verifier 读取 payload identity
- **THEN** MUST 以 npm payload manifest 为唯一 authority

### Requirement: 真实文件资源必须具有明确 materialization 与清理边界
**Reason**: SEA 与平台资源 materialization 已退出当前范围。
**Migration**: 使用新增的 npm 真实文件资源边界。

#### Scenario: 移除 SEA materialization
- **WHEN** npm runtime 解析真实文件资源
- **THEN** MUST 从已验证 npm payload root 解析且不得使用 SEA 资源路径

### Requirement: 产品进程重入与 Workspace Node 执行必须显式分类
**Reason**: 当前正式主进程是 npm Host Node，不再存在 Product Node role。
**Migration**: 使用新增的 Host Node 与 Workspace Node 分类要求。

#### Scenario: 移除 Product Node 重入
- **WHEN** npm Buildr 需要产品重入或 Workspace-owned execution
- **THEN** MUST 分别使用已登记 Host Node invocation 与声明 Workspace Node
