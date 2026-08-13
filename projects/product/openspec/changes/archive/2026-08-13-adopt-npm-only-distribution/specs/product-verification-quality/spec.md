## ADDED Requirements

### Requirement: CI 必须覆盖最低 Node、当前 Node 与 npm Launcher 平台行为
CI MUST 在 `engines.node` 最低支持 Node 与当前 Node 24 上分别安装同一 npm tarball并验证 CLI、`buildr web --no-open`、health/readiness 和 Workspace-owned runtime role。macOS 与 Windows Launcher 行为 MUST 在对应 OS runner 验证本机 wrapper/shortcut lifecycle，但 MUST NOT 声称验证 SEA、installer、签名或无需 Node 的平台产品。

#### Scenario: 两个兼容 Host Node
- **WHEN** Candidate 执行最低 Node 与当前 Node jobs
- **THEN** 两者 MUST 消费同一 tarball，并分别通过普通 CLI 无 HTTP、Web health/readiness、identity 与 Host/Workspace Node 分离
- **AND** tarball MUST NOT 为不同 Node 重新 pack

#### Scenario: 操作系统 Launcher 验证
- **WHEN** macOS 或 Windows runner 执行 Launcher lifecycle
- **THEN** verifier MUST 从隔离 npm installation 显式 install/status/launch/repair/uninstall 本机投射并验证 ownership
- **AND** MUST 证明普通 npm install 零桌面副作用且 wrapper/shortcut 不复制 Node 或 package

### Requirement: release smoke 必须验证 npm 安装与 Launcher 生命周期
Release smoke MUST 从唯一冻结 npm tarball 安装 Buildr，并 MUST 验证 CLI、Buildr Web、npm update authority 和显式 Launcher install/status/repair/uninstall。它 MUST 验证 drift/foreign target fail closed 与 npm package/Workspace data 保留；不得用源码启动或平台 staging 目录替代。

#### Scenario: npm tarball lifecycle
- **WHEN** release smoke 将 tarball 安装到隔离 prefix
- **THEN** `buildr --help`、代表性 CLI、`buildr web --no-open`、health/readiness 和 `launcher install/status/launch` MUST 使用该 prefix 的 Host Node/package entry
- **AND** ordinary install/CLI MUST NOT 自动创建 Launcher 或启动 HTTP

#### Scenario: repair 与 uninstall
- **WHEN** verifier 使 binding 中一个 identity field 漂移后执行 status/launch/repair/uninstall
- **THEN** status/launch MUST fail closed，repair MUST 从同一 formal npm installation 原子恢复，uninstall MUST 只删除 owned Launcher
- **AND** npm package 与 Workspace/user data MUST 保持不变

### Requirement: 正式发布必须围绕一个不可变 npm tarball 收敛
Buildr 正式发布 MUST 只执行一次 `npm pack`，并 MUST 让 inventory、Host Node smoke、Launcher lifecycle、protected publish、Registry integrity readback 与安装后 smoke 使用同一 tarball bytes。任何需要重新 pack 的路径 MUST 停止并重新开始尚未产生公开事实的候选。

#### Scenario: 构建与验证单一 tarball
- **WHEN** tag workflow 进入可逆候选阶段
- **THEN** workflow MUST 冻结 tarball filename、size、SHA-256、SHA-512 integrity、payload digest 与 source commit
- **AND** 全部后续检查 MUST 逐字节核对该 identity

#### Scenario: publish 与 readback
- **WHEN** 可逆门禁全部通过且 protected npm publish 获得授权
- **THEN** workflow MUST 发布冻结 tarball并从 Registry 核对相同 integrity 后安装 smoke
- **AND** MUST NOT 上传 GitHub Release binary Asset 或使用 Actions artifact 作为公共下载

### Requirement: npm 正式发布恢复必须保留已完成的不可逆事实
发布恢复 MUST 以 tag/commit、npm package/version/integrity 和冻结 tarball identity 为 authority。npm version 缺失时只补齐 publish；完全相同时复用；漂移时停止。恢复 MUST NOT 重建 tarball、删除 tag、unpublish、改用本地 publish 或创建平台 Assets。

#### Scenario: npm publish 部分成功后重跑
- **WHEN** Registry 已有相同 version 与 integrity，但后续 readback 失败
- **THEN** rerun MUST 复用 Registry 事实并只重试 readback/smoke
- **AND** MUST NOT再次 publish 或 pack

#### Scenario: Registry bytes 漂移
- **WHEN** 相同 version 的 Registry integrity 与冻结 tarball 不同
- **THEN** workflow MUST fail closed 并保留所有公开事实供人工处理
- **AND** MUST NOT覆盖、撤销或生成替代 version

### Requirement: Host Node 与 Workspace Node runtime role 必须分别验证
Candidate MUST 从最终 npm tarball验证主进程使用 formal installation 绑定的 Host Node，Workspace-owned subprocess 使用 Workspace 精确声明的 Node，并 MUST 比较 role、path、executable SHA-256、identity 和 runtime directory digest。Launcher 启动的主进程 MUST 与 CLI 报告同一 Host Node/installation identity。

#### Scenario: npm CLI 与 Launcher runtime role
- **WHEN** npm CLI 与其显式 Launcher 分别执行同一 Workspace-owned verification capability
- **THEN** 两个主进程 MUST 报告相同 `host` identity，Workspace child MUST 报告相同独立 `workspace` identity
- **AND** Host Node 与 Workspace Node 版本相同 MUST NOT 合并 ownership 或 path

#### Scenario: npm package 更新
- **WHEN** verifier 模拟同 prefix 的 package update 并刷新 Launcher binding
- **THEN** Buildr/package/payload identity MAY 更新，但 Workspace Node identity、path、executable 与 directory digest MUST 不变
- **AND** Launcher MUST 继续绑定更新后的 Host Node/package entry 而不是 Workspace Node

## REMOVED Requirements

### Requirement: CI 必须覆盖最低 Node、当前 Node 和目标桌面平台
**Reason**: 当前桌面平台验证对象是 npm Launcher 行为，而不是 SEA/installer 产品。
**Migration**: 使用新增的双 Host Node 与 npm Launcher OS behavior requirement。

#### Scenario: 验证 npm Launcher 平台行为
- **WHEN** CI 在 macOS 或 Windows 运行
- **THEN** MUST 验证本机 npm Launcher而非平台 installer

### Requirement: release smoke 必须验证安装后生命周期
**Reason**: 当前安装后生命周期是 npm package 与本机 Launcher，不是平台 installer。
**Migration**: 使用新增的 npm installation/Launcher lifecycle smoke requirement。

#### Scenario: 验证 npm 安装后 lifecycle
- **WHEN** release smoke 安装冻结 tarball
- **THEN** MUST 验证 CLI、Web 与 Launcher lifecycle

### Requirement: 正式发布必须围绕一个不可变 tarball 收敛
**Reason**: 当前需明确唯一 tarball 是 npm artifact，禁止推导平台制品。
**Migration**: 使用新增的 immutable npm tarball requirement。

#### Scenario: 冻结唯一 npm tarball
- **WHEN** Candidate 完成 `npm pack`
- **THEN** 后续 smoke/publish/readback MUST 使用同一 bytes

### Requirement: 正式发布恢复必须保留已完成的不可逆事实
**Reason**: 当前不可逆事实只来自 npm Registry publish/integrity。
**Migration**: 使用新增的 npm recovery requirement。

#### Scenario: 恢复 npm publish 事实
- **WHEN** tag workflow 重跑
- **THEN** MUST 按 version/integrity 复用或 fail closed

### Requirement: Node runtime role 验证必须覆盖主进程与 Workspace subprocess
**Reason**: 当前主进程 role 是 Host Node，不再存在 Product Node。
**Migration**: 使用新增的 Host/Workspace runtime-role verification requirement。

#### Scenario: 验证两个当前 runtime role
- **WHEN** Candidate 执行 Workspace-owned verification
- **THEN** MUST 分别证明 Host main process 与 Workspace child identity

### Requirement: 平台候选必须验证最终 installer 而非 staging
**Reason**: 当前不构建平台 installer；Release artifact 是最终 npm tarball。

**Migration**: 用从 tarball 安装后的 npm/Launcher lifecycle System smoke 替代 installer smoke。

#### Scenario: Release target 是 npm installation
- **WHEN** Candidate 执行 release smoke
- **THEN** verifier MUST 从最终 tarball 安装后验证 CLI/Web/Launcher lifecycle
- **AND** MUST NOT接受 platform staging 或 installer 作为目标

### Requirement: 平台签名、结构与体积必须是 Candidate 门禁
**Reason**: 当前没有公开平台 binary、Developer ID、公证、Authenticode 或 installer 体积门禁。

**Migration**: Candidate 必须验证 npm tarball inventory/size 与本机 Launcher 无复制结构；未来平台分发需新 Change 恢复签名门禁。

#### Scenario: 当前结构门禁不包含签名
- **WHEN** Candidate 检查图形 Launcher
- **THEN** verifier MUST 证明 wrapper/shortcut不复制 Node/package/payload并精确绑定 npm identity
- **AND** MUST NOT要求 Developer ID、公证、Authenticode 或 installer size

### Requirement: manifest、checksums 与 asset ensure 必须具有契约测试
**Reason**: 当前不发布平台 manifest/checksums/GitHub Release Assets。

**Migration**: 保留 npm tarball SHA-256/SHA-512、Registry version/integrity ensure 与 readback 契约测试。

#### Scenario: 当前发布契约测试
- **WHEN** release contract tests 运行
- **THEN** tests MUST 覆盖 npm artifact missing/same/drift、同 tarball smoke/publish/readback 和禁止 GitHub binary Asset
- **AND** MUST NOT要求 platform manifest/checksums/asset ensure fixtures
