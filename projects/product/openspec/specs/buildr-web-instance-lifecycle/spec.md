# buildr-web-instance-lifecycle Specification

## Purpose

定义 Web 默认实例与 Preview 生命周期的模块所有权、Bootstrap 接入、技术机制复用和行为等价边界。

## Requirements

### Requirement: Web 实例生命周期必须由窄模块拥有
Buildr MUST 由 `web/application` 唯一编排默认实例与 Preview 的启动、复用、停止、维护、异常恢复和资源清理，并 MUST 通过 `web/module.ts` 向既有 Bootstrap 贡献生命周期能力和 CLI commands；Bootstrap 与 HTTP Host MUST NOT 重复维护这些策略。

#### Scenario: Bootstrap 启动 Web 命令
- **WHEN** CLI Host 分发 `buildr web` 或 `buildr web preview` 命令
- **THEN** command MUST 来自 Web module 的唯一 contribution
- **AND** Web Application MUST 执行实例生命周期用例
- **AND** Bootstrap MUST NOT 内嵌端口、PID、锁、Secret、复用或清理策略

#### Scenario: HTTP Host 创建 server
- **WHEN** Web Application 需要启动新的默认或 Preview 实例
- **THEN** Application MUST 调用 HTTP Host 的 server factory
- **AND** HTTP Host MUST NOT 注册 CLI 方法或拥有实例 receipt、启动锁、scheduled maintenance 与浏览器打开策略

### Requirement: Web 专属运行状态必须与通用技术机制分离
Buildr MUST 将实例 receipt、启动锁、PID、Secret、健康探测和认证退出等 Web 专属适配放入 `web/infrastructure`，并 MUST 复用全局 Infrastructure 已有的 filesystem、process、network、platform、产品身份与原子写入机制。Web Infrastructure MUST NOT 创建第二套 Workspace、Worktree、Launcher 或业务 persistence authority。

#### Scenario: 写入实例状态
- **WHEN** 一个 Web 实例健康就绪并保存运行状态
- **THEN** Web Infrastructure MUST 使用既有受管原子写入机制保存相同 schema、字段和 Data Root
- **AND** MUST NOT 新建另一份 instance receipt、连接、事务或 writer

#### Scenario: Preview管理自己的资源
- **WHEN** Task Preview启动、停止或清理进程
- **THEN** Web Application MUST直接维护Preview owner、PID、Secret和实例状态
- **AND** Web module MUST NOT登记统一Task资源或写其他owner persistence

### Requirement: 生命周期迁移必须保持外部行为等价
Buildr MUST 在迁移前后保持公开 CLI、HTTP、JSON、错误语义、端口选择与 fallback、实例复用、Launcher handoff、Preview ownership、维护频率、信号退出、SQLite schema 和运行副作用等价。

#### Scenario: 复用健康默认实例
- **WHEN** 相同 Web profile 再次请求已有健康实例
- **THEN** Buildr MUST 返回原实例 URL且不得启动第二个 server
- **AND** Launcher binding、Workspace 页面 URL 与浏览器打开行为 MUST 保持既有语义

#### Scenario: 管理 Task Preview
- **WHEN** 调用方启动、枚举或停止由Preview能力拥有的实例
- **THEN** Buildr MUST保持owner、Secret、Worktree identity、instance receipt和fail-closed校验
- **AND** 公开 JSON schema 与人类可读输出 MUST 保持不变

#### Scenario: 运行 scheduled maintenance
- **WHEN** 默认 Web server 就绪、关闭或启动失败
- **THEN** maintenance MUST 按既有时机启动、停止或清理
- **AND** Preview MUST NOT 获得默认实例 maintenance

### Requirement: 生命周期切片不得取得 HTTP 或前端 authority
本 Child MUST NOT 修改 HTTP Router、Controller、Session、安全边界、静态文件托管、`web-dist` 正式构建或 sibling `buildr-web` 前端源码 authority。

#### Scenario: 验证迁移范围
- **WHEN** 架构与发布物验证检查本 Change 的最终树
- **THEN** 生命周期实现 MUST 位于扁平的 Web 技术层并由 module entry 接入
- **AND** HTTP 路由、安全响应、静态资源内容、React/Vite 源码与前端构建流程 MUST 保持未迁移状态

### Requirement: Buildr Web instance lifecycle 的公开说明不得泄漏旧产品名
instance、health、启动、停止和生命周期诊断的公开说明 MUST 使用 Buildr Web Runtime 术语；已发布 instance/health schema identity MUST 保持稳定并继续被 reader 接受。

#### Scenario: 读取运行状态
- **WHEN** CLI 或 Web 读取 Buildr Web instance/health 状态
- **THEN** 可见产品名 MUST 为 Buildr Web
- **AND** 旧 `buildr.local-app-*` schema identity MUST 仍可验证

### Requirement: npm 更新交接必须核对同一安装和实例观察

npm 更新后的实例替换 MUST 由网页唯一生命周期能力执行，并使用当前新版安装身份、同槽位历史安装事实以及已观察的旧实例身份确认目标。启动锁内 MUST 重新核对实例，不能凭进程编号、版本号、地址或目录外观接管其他实例。适用时 MUST 保留原访问端口以便原地址继续访问；端口不可用时 MUST 诚实报告实际地址，不冒称原页面已恢复。切换成功 MUST 以新版服务健康身份为依据，不得据此声称浏览器已加载的前端代码也已刷新。

#### Scenario: 同槽位旧版启动器或命令行实例

- **WHEN** 当前新版与已观察旧实例均能证明属于同一 npm 安装槽位
- **THEN** 生命周期 MUST 复用既有认证退出、启动锁、记录清理与健康验证完成交接
- **AND** MUST 不要求存在启动器（Launcher）绑定，不得接管开发版实例

#### Scenario: 并发期间实例已变化

- **WHEN** 取得启动锁后原实例已被另一个实例替换
- **THEN** 生命周期 MUST 重新验证实际实例；匹配当前安装新版时复用，其他替换时保留现场并报告冲突
- **AND** MUST NOT 依据旧观察停止后来出现的外来实例

### Requirement: 默认实例必须支持同身份重启接管
Buildr MUST 在网页唯一生命周期能力中提供默认实例的同身份重启：经会话授权的 restart 请求由当前实例启动同产品入口的后继进程，后继进程携带已观察实例摘要与原访问端口，在启动锁内复用既有认证退出、启动锁、记录清理与健康验证完成接管。接管 MUST 适用于 released 与 development 渠道，MUST NOT 要求 npm 安装槽位或版本变化证明。适用时 MUST 保留原访问端口以便原地址继续访问；端口不可用时 MUST 诚实报告实际地址，不冒称原页面已恢复。

#### Scenario: 同身份实例被重启
- **WHEN** released 或 development 渠道的当前健康默认实例收到已授权 restart 请求
- **THEN** 当前实例 MUST 先建立响应，再以同产品入口 spawn 后继进程并传递实例观察摘要与原端口
- **AND** 后继进程 MUST 在启动锁内重新核对记录实例身份与摘要，只对仍匹配观察的实例发起认证退出，并在旧实例确认退出后绑定原端口、写入新实例回执

#### Scenario: 接管期间实例已变化
- **WHEN** 后继进程取得启动锁后实际实例与观察摘要不再一致
- **THEN** 生命周期 MUST 保留现场并报告冲突
- **AND** MUST NOT 依据旧观察停止后来出现的外来实例

#### Scenario: 重启接管失败保留旧实例
- **WHEN** 后继进程未能在约定预算内完成认证退出与健康接管
- **THEN** 旧实例 MUST 继续运行或如实报告其已退出，接管失败 MUST NOT 静默产生第二个常驻实例
- **AND** 已成立的实例回执与启动锁事实 MUST 保持可诊断

#### Scenario: Preview 实例不适用重启
- **WHEN** 生命周期入口处理 Preview owner 实例的 restart 请求
- **THEN** MUST 拒绝该请求并保持 Preview 实例运行
- **AND** Preview 生命周期事实与默认实例维护策略 MUST 保持不变

### Requirement: 显式请求可替换来源不匹配的开发实例
`buildr web` SHALL 提供显式的 development 实例替换请求（`--replace-mismatched-development`）。仅 development profile 接受该请求；npm/released profile、npm Launcher binding 或更新交接 MUST NOT 接受该请求并失败关闭。来源匹配的健康 development 实例 MUST 正常复用，不执行替换。来源不匹配或缺少来源证明的健康 development 实例 MUST 在取得启动锁后复用既有认证退出、有界等待与实例记录清理，再按当前产品身份启动新实例；过程 MUST NOT 终止进程（kill）、MUST NOT 无界等待、MUST NOT 在未确认旧实例退出前启动新实例。

#### Scenario: 来源不匹配时替换旧实例
- **WHEN** 健康 development 实例的开发来源内容与当前来源不匹配，且调用方显式请求替换
- **THEN** Web 生命周期 MUST 在启动锁内请求旧实例认证退出、有界等待其 receipt 移除，再启动并写入新实例 receipt
- **AND** 新实例 health 身份 MUST 证明属于当前开发来源后才返回成功

#### Scenario: 退出失败或等待超时
- **WHEN** 旧实例拒绝认证退出、有界等待内未退出，或等待期间实例 receipt 被其他实例替换
- **THEN** 启动 MUST 保留现场并返回明确诊断
- **AND** MUST NOT 启动第二个实例或接管后来出现的实例

#### Scenario: 来源已匹配或实例不可用
- **WHEN** 当前实例匹配当前开发来源，或没有可证明健康的不匹配实例
- **THEN** 前者 MUST 正常复用不重启；后者 MUST 按既有 absent/stale/unreachable 路径处理

#### Scenario: 非 development 或组合冲突
- **WHEN** npm/released profile、Launcher binding、更新交接或不兼容选项携带替换请求
- **THEN** 启动 MUST 明确拒绝并不执行任何实例替换

### Requirement: development 实例替换不改变既有生命周期语义
实例替换 MUST 复用默认实例既有的启动锁、实例 receipt schema、健康探测、端口策略、maintenance 与信号退出语义；MUST NOT 引入第二套实例记录、绕过启动锁或跳过 Workspace 登记。

#### Scenario: 替换后的默认实例语义
- **WHEN** development 实例完成替换并写入新 receipt
- **THEN** 新实例的 registry 写入、浏览器打开策略、端口选择与 maintenance MUST 与普通启动一致
- **AND** released/development 双 profile 隔离 MUST 保持
