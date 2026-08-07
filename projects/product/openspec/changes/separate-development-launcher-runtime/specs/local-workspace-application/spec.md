## MODIFIED Requirements

### Requirement: Launcher 必须暴露可诊断的运行身份和失败反馈
Buildr launcher MUST 携带版本、channel、构建来源和平台 identity，并 MUST 在启动失败、source checkout 不可用、受管 Node 缺失或版本不兼容时提供用户可见反馈。

#### Scenario: Release launcher 成功启动
- **WHEN** release launcher 启动或复用兼容的 Buildr 单实例
- **THEN** launcher MUST 使用自身 bundle runtime 启动或复用实例，并用实例返回的 loopback URL 打开浏览器
- **AND** 随机端口 MUST 保持为内部状态

#### Scenario: Development launcher 成功启动
- **WHEN** 绑定 checkout、Buildr CLI 入口和受管 Node probe 均通过
- **THEN** launcher MUST 使用绑定 checkout 的当前 `bin/buildr.mjs` 启动或复用实例
- **AND** status MUST 报告 source root、observed checkout、Node identity 和运行实例 identity

#### Scenario: Development source checkout 不可用
- **WHEN** source root 被移动、删除、不是预期 Buildr Service checkout 或缺少 CLI 入口
- **THEN** launcher MUST 拒绝启动并输出 source root、原因、日志位置和重新安装 development launcher 的动作
- **AND** MUST NOT 回退到另一个 checkout、Release bundle 或 PATH 中的 Buildr

#### Scenario: Development Node runtime 不可用
- **WHEN** identity 指定的受管 Node executable 缺失、版本不匹配或不能启动
- **THEN** launcher MUST 拒绝启动并输出 Node version、runtime path、日志位置以及 `buildr sync`/重新安装动作
- **AND** MUST NOT 静默选择 PATH 中的另一个 Node

#### Scenario: Launcher 启动失败
- **WHEN** runtime 缺失、bundle 不完整、实例未就绪或浏览器打开失败
- **THEN** launcher MUST 显示简短错误、日志位置和重试动作
- **AND** MUST NOT 仅静默退出

#### Scenario: 已运行实例版本不兼容
- **WHEN** 现有实例与自身 App protocol 或 runtime identity 不兼容
- **THEN** launcher MUST 拒绝静默复用
- **AND** MUST 安全退出旧实例后启动当前版本，或明确告知阻塞原因

### Requirement: 开发 launcher 必须支持安全的重复构建和本机更新
Buildr MUST 为 development checkout 提供 canonical launcher 安装入口，并 MUST 使用 stage、verify、switch 更新独立的 development thin launcher；该 launcher MUST 绑定 checkout，而不是复制 Buildr application 或 Node runtime 快照。

#### Scenario: 首次安装开发 launcher
- **WHEN** 开发者从 Buildr Service checkout 执行 canonical 安装入口
- **THEN** Buildr MUST 在 staging 构建带 source root、checkout identity 和受管 Node identity 的 thin bundle
- **AND** thin bundle MUST NOT 包含 Node executable、Node 动态库、Buildr `src/`、`package/` 或 `node_modules`
- **AND** MUST 验证后安装为隔离的 `Buildr Dev`
- **AND** macOS 默认目标 MUST 为 `/Applications/Buildr Dev.app`
- **AND** macOS launcher MUST 作为不驻留 Dock 的后台入口运行

#### Scenario: 源码修改后启动 development launcher
- **WHEN** checkout 的 `src/`、Web resource 或 migration 已改变，但 source root 和 Node identity 仍有效
- **THEN** development launcher MUST 在重启服务后读取当前 checkout 内容
- **AND** MUST NOT 要求重新复制 Node 或 Buildr application

#### Scenario: 更新正在使用的开发 launcher
- **WHEN** 已安装 launcher 或服务仍使用旧 thin bundle
- **THEN** 更新流程 MUST 先构建并验证新版本，再安全退出旧实例并等待释放
- **AND** MUST NOT 原地覆盖运行中的 bundle

#### Scenario: 开发 launcher 切换失败
- **WHEN** 新 bundle 验证、退出、安装切换或启动核对失败
- **THEN** 更新流程 MUST 保留或恢复上一已验证版本
- **AND** MUST 返回失败阶段、旧版本状态、staging 位置和恢复建议

#### Scenario: 开发 launcher 更新成功
- **WHEN** 新 thin bundle 已原子安装且启动核对通过
- **THEN** 诊断 MUST 显示 source root、checkout identity、Node identity、安装目标和运行 identity
- **AND** 旧 staging MUST 清理而不影响正式 App
