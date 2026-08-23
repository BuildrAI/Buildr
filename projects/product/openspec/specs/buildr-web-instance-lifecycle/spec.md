# buildr-web-instance-lifecycle Specification

## Purpose

定义 Web 默认实例与 Preview 生命周期的模块所有权、Bootstrap 接入、技术机制复用和行为等价边界。

## Requirements

### Requirement: Web 实例生命周期必须由窄模块拥有
Buildr MUST 由 `web/application` 唯一编排默认实例与 Preview 的启动、复用、停止、维护、异常恢复和资源清理，并 MUST 通过 `web/module.mjs` 向既有 Bootstrap 贡献生命周期能力和 CLI commands；Bootstrap 与 HTTP Host MUST NOT 重复维护这些策略。

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
Buildr MUST 将实例 receipt、启动锁、PID、Secret、健康探测和认证退出等 Web 专属适配放入 `web/infrastructure`，并 MUST 复用全局 Infrastructure 已有的 filesystem、process、network、platform、产品身份与原子写入机制。Web Infrastructure MUST NOT 创建第二套 Workspace、Task Environment、Launcher 或业务 persistence authority。

#### Scenario: 写入实例状态
- **WHEN** 一个 Web 实例健康就绪并保存运行状态
- **THEN** Web Infrastructure MUST 使用既有受管原子写入机制保存相同 schema、字段和 Data Root
- **AND** MUST NOT 新建另一份 instance receipt、连接、事务或 writer

#### Scenario: Preview 与 Task Environment 协作
- **WHEN** Task Preview 启动、停止或清理 Environment resource
- **THEN** Web Application MUST 继续调用 Task Environment 的公开 resource register、probe、release 或 cleanup 能力
- **AND** Web module MUST NOT 解释或直接写 Task Environment persistence

### Requirement: 生命周期迁移必须保持外部行为等价
Buildr MUST 在迁移前后保持公开 CLI、HTTP、JSON、错误语义、端口选择与 fallback、实例复用、Launcher handoff、Preview ownership、维护频率、信号退出、SQLite schema 和运行副作用等价。

#### Scenario: 复用健康默认实例
- **WHEN** 相同 Web profile 再次请求已有健康实例
- **THEN** Buildr MUST 返回原实例 URL且不得启动第二个 server
- **AND** Launcher binding、Workspace 页面 URL 与浏览器打开行为 MUST 保持既有语义

#### Scenario: 管理 Task Preview
- **WHEN** 调用方启动、枚举或停止由 Task Environment 拥有的 Preview
- **THEN** Buildr MUST 保持现有 owner、Secret、provider identity、resource receipt 和 fail-closed 校验
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
