# system-installation-module-architecture Specification

## Purpose

规定 System Installation 的模块职责、技术分层、公开端口、Bootstrap 组装和旧入口退出条件，并保持既有安装与 Launcher 行为等价。

## Requirements

### Requirement: System Installation MUST拥有唯一模块边界
Buildr MUST 将 npm installation identity、installation origin/registry、CLI update、installation status、npm lifecycle enrollment、Launcher binding 及 Launcher install/status/repair/uninstall 归入 `src/system/installation`，并 MUST 通过唯一 `module.ts` 向 Bootstrap 和其他模块公开窄 capability 与 CLI contribution。全局 Infrastructure MUST只保留通用技术机制，不得成为 Installation 业务身份或 Launcher lifecycle 的第二 owner。

#### Scenario: Bootstrap 组装 Installation
- **WHEN** Buildr 创建普通 CLI 或 Web runtime
- **THEN** Bootstrap MUST显式安装一次 System Installation module
- **AND** update、installation status 与 Launcher commands MUST只从该模块贡献或注册

#### Scenario: 其他模块消费安装事实
- **WHEN** Web Runtime、Bootstrap identity 或 Application Payload lifecycle 需要当前产品身份、installation registry 或 Launcher binding
- **THEN** 它们 MUST消费 System Installation 的公开端口
- **AND** MUST NOT复制 origin、registry、binding 或 Launcher 写入实现

### Requirement: Installation 技术分层 MUST保持职责与 writer authority
System Installation MUST 将安装与更新编排放在 `application/`，将 origin、registry、identity、binding 和平台 Launcher 适配放在 `infrastructure/`，将公共 CLI 参数与错误映射放在 `interfaces/cli/`。通用 filesystem、process、network、platform、crypto 与 product resource 机制 MUST继续由全局 Infrastructure 提供；Web 只消费安装身份和绑定校验，不得取得 Launcher 安装或 update writer authority。

#### Scenario: Launcher 调用 Web
- **WHEN** 用户从已验证 npm installation 创建或启动 Launcher
- **THEN** Installation module MUST继续绑定同一 Host Node、package entry、prefix、installation identity、protocol 与 payload identity
- **AND** Launcher MUST继续调用 `buildr web`，但 MUST NOT成为 HTTP Server 或 Web 实例生命周期 owner

#### Scenario: 通用技术机制复用
- **WHEN** Installation 写入 registry、binding 或 Launcher target
- **THEN** 它 MUST复用全局 Infrastructure 提供的通用技术机制
- **AND** MUST NOT创建第二套文件、进程、平台或原子写入实现

### Requirement: 结构迁移 MUST保持安装公共行为等价
迁移前后的公开 CLI、HTTP、JSON、installation origin/registry/binding schema、npm/development channel、release track、Host Node/package ownership、Launcher 端口与原子替换、update 及错误语义 MUST保持等价。迁移 MUST同步更新 Application Payload、Verification owner 与相关测试，并 MUST删除已完成迁移的旧 Installation 专属入口。

#### Scenario: Installation 与 Launcher commands
- **WHEN** 用户执行 `buildr update`、`buildr installation status` 或 `buildr web launcher install|status|repair|uninstall`
- **THEN** 命令参数、输出 schema、状态、next actions 与副作用 MUST与迁移前等价
- **AND** 每个 command MUST只有一个注册和 writer 路径

#### Scenario: Application Payload 与 npm package
- **WHEN** Buildr 构建或验证 Application Payload 和 npm candidate tarball
- **THEN** payload MUST包含并消费同一 installation origin、registry、identity 与 Launcher implementation
- **AND** development checkout、matching Worktree与npm package的适用入口 MUST保持逻辑身份和运行行为等价

#### Scenario: 旧入口退出
- **WHEN** System Installation module 的全部直接消费者已迁移并通过验证
- **THEN** 旧 `src/application`、`src/interfaces/cli`、`src/infrastructure/product-identity` 与 `src/infrastructure/product-launcher` 中的 Installation 专属入口 MUST被删除
- **AND** repository MUST不存在长期双实现、双注册或无退出条件兼容 Facade

### Requirement: 本切片 MUST保留 System 与 Web 的后续边界
本迁移 MUST NOT重构 Doctor、Web HTTP Server、Router、Session、安全边界、静态文件托管、Web 实例生命周期策略、React/Vite 前端或 npm 发布流程。`system-capabilities` 的 Child handoff MUST将未迁移 Doctor 明确标记为 residual。

#### Scenario: Installation Child 完成交接
- **WHEN** System Installation 迁移完成并形成 Parent Contribution Handoff
- **THEN** handoff MUST说明 Installation 已迁移且 Doctor 仍由后续独立 Child 负责
- **AND** MUST NOT把整个 `system-capabilities` 冒充为已完整交付

### Requirement: Release Version 规则必须由 System Installation Domain 拥有
Buildr MUST 将 SemVer parse、compare 与 default release track 规则归入 `system/installation/domain`，Release Awareness Application 与 release tools MUST复用同一 Domain 实现，且迁移 MUST保持版本判断和发布行为等价。

#### Scenario: Release Awareness 判断更新轨道
- **WHEN** System Installation 解析当前版本或 registry dist-tag
- **THEN** Release Awareness MUST调用 System Installation Domain 的 release version 规则
- **AND** stable/candidate 判断、无效版本诊断和版本比较结果 MUST与迁移前一致

#### Scenario: Release tools 校验版本
- **WHEN** release contract 或 registry version state 校验版本
- **THEN** release tools MUST复用同一 System Installation Domain 实现
- **AND** MUST NOT复制第二份 SemVer parser 或依赖旧顶层 Domain 路径

#### Scenario: 检查旧全局 Domain
- **WHEN** 架构验证扫描生产源码和 release tools
- **THEN** `src/domain/release-version.mjs` MUST不存在且无引用
