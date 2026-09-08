# system-installation-module-architecture Specification

## Purpose

规定 System Installation 的模块职责、技术分层、公开端口、Bootstrap 组装和旧入口退出条件，并保持既有安装与 Launcher 行为等价。

## Requirements

### Requirement: System Installation MUST拥有唯一模块边界
Buildr MUST 将 npm installation identity、installation origin/registry、CLI update、installation status、npm lifecycle enrollment、Release Awareness、Launcher binding 及 Launcher install/status/repair/uninstall 归入 `src/modules/installation`，并 MUST通过唯一 `module.ts` 向 Bootstrap 和其他模块公开窄 capability 与 CLI/HTTP/diagnostic contribution。全局 Infrastructure MUST只保留通用技术机制，`package/`与`src/system/` MUST不再成为 Installation 或 Launcher 源码 owner。

#### Scenario: Bootstrap 组装 Installation
- **WHEN** Buildr 创建普通 CLI 或 Web runtime
- **THEN** Bootstrap MUST显式安装一次 Installation module
- **AND** update、installation status、Release Awareness 与 Launcher commands MUST只从该模块贡献或注册

#### Scenario: 其他模块消费安装事实
- **WHEN** Web Runtime、Bootstrap identity、Diagnostics 或 Application Payload lifecycle 需要当前产品身份、installation registry 或 Launcher binding
- **THEN** 它们 MUST消费 Installation 的公开 capability
- **AND** MUST NOT复制 origin、registry、binding、version 或 Launcher 写入实现

### Requirement: Installation 技术分层 MUST保持职责与 writer authority
Installation MUST将安装、更新与提醒编排放在 `application/`，将 release version 规则放在 `domain/`，将 origin、registry、identity、binding 和平台 Launcher 适配放在 `infrastructure/`，将公共 CLI/HTTP 参数与错误映射放在 `interfaces/`。通用 filesystem、process、network、platform、crypto 与 product resource 机制 MUST继续由全局 Infrastructure 提供；Web 只消费安装身份、提醒读取和绑定校验，不得取得 Launcher 安装或 update writer authority。

#### Scenario: Launcher 调用 Web
- **WHEN** 用户从已验证 npm installation 创建或启动 Launcher
- **THEN** Installation module MUST继续绑定同一 Host Node、package entry、prefix、installation identity、protocol 与 payload identity
- **AND** Launcher MUST继续调用 `buildr web`，但 MUST NOT成为 HTTP Server 或 Web 实例生命周期 owner

#### Scenario: 工程构建 Development Launcher
- **WHEN** checkout 构建或维护 Development Launcher
- **THEN** `tools/build/launcher` MUST调用 Installation 的公开规则或入口并生成薄 Launcher
- **AND** 工程程序 MUST不进入 npm runtime dependency 或取得 installation registry writer authority

#### Scenario: 通用技术机制复用
- **WHEN** Installation 写入 registry、binding 或 Launcher target
- **THEN** 它 MUST复用全局 Infrastructure 提供的通用技术机制
- **AND** MUST NOT创建第二套文件、进程、平台或原子写入实现

### Requirement: 结构迁移 MUST保持安装公共行为等价
迁移前后的公开 CLI、HTTP、JSON、installation origin/registry/binding schema、npm/development channel、release track、Host Node/package ownership、Launcher 端口与原子替换、update 及错误语义 MUST保持等价。迁移 MUST同步更新 Application Payload、Verification owner、资源清单与相关测试，并 MUST删除 `src/system/installation`、`package/launchers` 与其他已完成迁移的旧入口。

#### Scenario: Installation 与 Launcher commands
- **WHEN** 用户执行 `buildr update`、`buildr installation status` 或 `buildr web launcher install|status|repair|uninstall`
- **THEN** 命令参数、输出 schema、状态、next actions 与副作用 MUST与迁移前等价
- **AND** 每个 command MUST只有一个注册和 writer 路径

#### Scenario: Application Payload 与 npm package
- **WHEN** Buildr 构建或验证 Application Payload 和 npm candidate tarball
- **THEN** payload MUST包含并消费同一 installation origin、registry、identity 与 Launcher implementation
- **AND** runtime Skill 源 MUST来自 `resources/runtime`，而不是 tracked `package/targets/runtime`
- **AND** development checkout、matching Worktree与npm package的适用入口 MUST保持逻辑身份和运行行为等价

#### Scenario: 旧入口退出
- **WHEN** Installation module 的全部直接消费者已迁移并通过验证
- **THEN** `src/system/installation`、`package/launchers`、`package/targets/runtime` 与旧 Installation 专属入口 MUST被删除
- **AND** repository MUST不存在长期双实现、双注册或无退出条件兼容 Facade

### Requirement: Release Version 规则必须由 System Installation Domain 拥有
Buildr MUST将 SemVer parse、compare 与 default release track 规则归入 `src/modules/installation/domain`，Release Awareness Application 与 release tools MUST复用同一 Domain 实现，且迁移 MUST保持版本判断和发布行为等价。

#### Scenario: Release Awareness 判断更新轨道
- **WHEN** Installation 解析当前版本或 registry dist-tag
- **THEN** Release Awareness MUST调用 Installation Domain 的 release version 规则
- **AND** stable/candidate 判断、无效版本诊断和版本比较结果 MUST与迁移前一致

#### Scenario: Release tools 校验版本
- **WHEN** release contract 或 registry version state 校验版本
- **THEN** release tools MUST复用同一 Installation Domain 实现
- **AND** MUST NOT复制第二份 SemVer parser 或依赖旧 `src/system/installation` 路径

#### Scenario: 检查旧全局 Domain
- **WHEN** 架构验证扫描生产源码和 release tools
- **THEN** `src/domain/release-version.mjs` 与 `src/system/installation/domain` MUST不存在且无引用

### Requirement: 安装查询与更新应用必须返回结构化结果
安装状态和 CLI 更新 Application MUST接收结构化输入并返回结果；所属 CLI Interface MUST拥有参数校验、输出格式和退出码。HTTP 等非命令消费者 MUST直接消费结构化能力。

#### Scenario: 调用安装状态或更新入口
- **WHEN** 执行本场景
- **THEN** 公开参数、JSON schema、人类输出、错误、退出行为与既有更新副作用 MUST保持等价，直接应用调用 MUST不写标准输出或进程退出码。
